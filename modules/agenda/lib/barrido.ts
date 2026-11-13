import "server-only";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations } from "@/db/schema";
import { deliverMessage } from "@/lib/channels/deliver";
import type { OpcionesBarrido, ResultadoBarrido } from "@/lib/modules/types";
import { agendaCitas } from "../tabla";
import { cuandoRelativo, decidirRecordatorio, reservaVencida, textoRecordatorio } from "./sena";
import { leerAjustes, zona } from "./servicio";
import { vencerReserva } from "./turnos";

/**
 * Barrido de la agenda (spec nucleo/19): reservas con sena vencidas y recordatorios del
 * dia anterior. Lo corren el barrido del proceso, el cron y los botones "probar ahora"
 * (soloSimulador: solo contactos creados desde /simulador, y ahi no se espera).
 */

const MAX_ENVIOS = 20;

const deSimulador = sql`${contacts.source} = 'simulador'`;

export async function barridoAgenda(op: OpcionesBarrido, que: { vencer?: boolean; recordar?: boolean } = { vencer: true, recordar: true }): Promise<ResultadoBarrido> {
  const res: ResultadoBarrido = { revisadas: 0, enviados: 0, errores: 0, detalle: [] };
  const ahora = new Date();
  const ignorar = Boolean(op.soloSimulador && op.ignorarEspera);

  if (que.vencer !== false) {
    const pendientes = await db
      .select({ cita: agendaCitas, nombre: contacts.name })
      .from(agendaCitas)
      .innerJoin(contacts, eq(contacts.id, agendaCitas.contactId))
      .where(and(eq(agendaCitas.estado, "pendiente_sena"), isNull(agendaCitas.senaPagadaAt), op.soloSimulador ? deSimulador : undefined))
      .limit(200);
    for (const { cita, nombre } of pendientes) {
      res.revisadas++;
      if (!ignorar && !reservaVencida(cita, ahora)) continue;
      try {
        if (await vencerReserva(cita)) {
          res.enviados++;
          res.detalle.push({ contacto: nombre, resultado: "reserva vencida: se libero el horario" });
        }
      } catch (err) {
        res.errores++;
        res.detalle.push({ contacto: nombre, resultado: `error al vencer: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  if (que.recordar !== false) {
    const a = await leerAjustes();
    if (!a.recordatorioActivo) {
      res.detalle.push({ contacto: null, resultado: "recordatorios apagados en la agenda" });
      return res;
    }
    const z = zona();
    const hasta = new Date(ahora.getTime() + (ignorar ? 60 * 86_400_000 : a.recordatorioHorasAntes * 3600_000));
    const citas = await db
      .select({
        cita: agendaCitas,
        nombre: contacts.name,
        channel: conversations.channel,
        lastInboundAt: conversations.lastInboundAt,
      })
      .from(agendaCitas)
      .innerJoin(contacts, eq(contacts.id, agendaCitas.contactId))
      .leftJoin(conversations, eq(conversations.id, agendaCitas.conversationId))
      .where(
        and(
          inArray(agendaCitas.estado, ["confirmada", "agendada"]),
          isNull(agendaCitas.recordatorioEnviadoAt),
          gt(agendaCitas.inicio, ahora),
          lte(agendaCitas.inicio, hasta),
          op.soloSimulador ? deSimulador : undefined
        )
      )
      .limit(200);

    for (const f of citas) {
      if (res.enviados >= MAX_ENVIOS) break;
      res.revisadas++;
      const d = decidirRecordatorio({
        ahora,
        zona: z,
        activo: a.recordatorioActivo,
        horasAntes: a.recordatorioHorasAntes,
        plantilla: a.recordatorioPlantilla,
        cita: f.cita,
        conversacion: f.cita.conversationId && f.channel ? { channel: f.channel, lastInboundAt: f.lastInboundAt } : null,
        ignorarEspera: ignorar,
      });
      if (!d.enviar) continue;
      // Reclamo atomico: una sola corrida manda el recordatorio de cada cita.
      const reclamadas = await db
        .update(agendaCitas)
        .set({ recordatorioEnviadoAt: new Date() })
        .where(and(eq(agendaCitas.id, f.cita.id), isNull(agendaCitas.recordatorioEnviadoAt)))
        .returning({ id: agendaCitas.id });
      if (reclamadas.length === 0) continue;
      try {
        const texto = textoRecordatorio(f.nombre, cuandoRelativo(f.cita.inicio, ahora, z), f.cita.servicio);
        const entrega =
          d.modo === "texto"
            ? await deliverMessage(f.cita.conversationId!, { text: texto }, "agent", { leidoHasta: f.lastInboundAt })
            : await deliverMessage(f.cita.conversationId!, { template: { name: d.plantilla!, language: "es_AR", previewText: texto } }, "template");
        if (!entrega.ok) throw new Error(entrega.error ?? "no se envio");
        res.enviados++;
        res.detalle.push({ contacto: f.nombre, resultado: "recordatorio enviado" });
      } catch (err) {
        await db.update(agendaCitas).set({ recordatorioEnviadoAt: null }).where(eq(agendaCitas.id, f.cita.id));
        res.errores++;
        res.detalle.push({ contacto: f.nombre, resultado: `no se envio el recordatorio: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }
  return res;
}
