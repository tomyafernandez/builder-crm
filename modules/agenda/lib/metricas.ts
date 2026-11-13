import "server-only";
import { and, gte, inArray, isNotNull, notInArray, sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { formatCurrency } from "@/lib/constants";
import { cuentaPorPrecio } from "@/lib/retorno";
import type { ContextoMetricas, MetricaRetorno } from "@/lib/modules/types";
import { agendaCitas } from "../tabla";

/**
 * Lo que la agenda aporta a "Lo que te dejo el sistema" (spec nucleo/19). Mismo criterio
 * que Reportes: afuera los contactos del simulador y del laboratorio.
 */
const contactoReal = sql`${contacts.source} <> 'simulador' and not ('laboratorio' = any(${contacts.tags}))`;

export async function metricasAgenda(dias: number, ctx: ContextoMetricas): Promise<MetricaRetorno[]> {
  const desde = new Date(Date.now() - dias * 86_400_000);

  // 1. Turnos que salieron de conversaciones recuperadas por el seguimiento.
  const recuperados = ctx.conversacionesRecuperadas.length
    ? await db
        .select({ precio: agendaCitas.precioCentavos })
        .from(agendaCitas)
        .innerJoin(contacts, eq(contacts.id, agendaCitas.contactId))
        .where(
          and(
            inArray(agendaCitas.conversationId, ctx.conversacionesRecuperadas),
            notInArray(agendaCitas.estado, ["cancelada", "vencida"]),
            gte(agendaCitas.createdAt, desde),
            isNotNull(agendaCitas.precioCentavos),
            contactoReal
          )
        )
    : [];
  const preciosRec = recuperados.map((r) => r.precio ?? 0);

  // 2. Turnos que el cliente confirmo despues del recordatorio.
  const confirmados = await db
    .select({ precio: agendaCitas.precioCentavos })
    .from(agendaCitas)
    .innerJoin(contacts, eq(contacts.id, agendaCitas.contactId))
    .where(
      and(
        isNotNull(agendaCitas.recordatorioEnviadoAt),
        gte(agendaCitas.recordatorioEnviadoAt, desde),
        sql`${agendaCitas.confirmadaPorClienteAt} > ${agendaCitas.recordatorioEnviadoAt}`,
        isNotNull(agendaCitas.precioCentavos),
        notInArray(agendaCitas.estado, ["cancelada", "vencida"]),
        contactoReal
      )
    );
  const preciosConf = confirmados.map((r) => r.precio ?? 0);
  const tasa = ctx.retorno.tasaAusencia;

  // 3. Senas cobradas en el periodo.
  const senas = await db
    .select({ sena: agendaCitas.senaCentavos })
    .from(agendaCitas)
    .innerJoin(contacts, eq(contacts.id, agendaCitas.contactId))
    .where(and(isNotNull(agendaCitas.senaPagadaAt), gte(agendaCitas.senaPagadaAt, desde), contactoReal));
  const totalSenas = senas.reduce((t, s) => t + (s.sena ?? 0), 0);

  return [
    {
      clave: "recuperado_seguimiento",
      etiqueta: "Recuperado por seguimiento",
      montoCentavos: preciosRec.reduce((a, b) => a + b, 0),
      cuenta: cuentaPorPrecio(preciosRec.length, preciosRec, preciosRec.length === 1 ? "turno" : "turnos", formatCurrency),
    },
    {
      clave: "ausencias_evitadas",
      etiqueta: "Ausencias evitadas",
      montoCentavos: Math.round(preciosConf.reduce((a, b) => a + b, 0) * tasa),
      cuenta: cuentaPorPrecio(preciosConf.length, preciosConf, "confirmados por recordatorio", formatCurrency, {
        texto: `${Math.round(tasa * 100)}% de ausencia`,
      }),
      estimado: true,
    },
    {
      clave: "senas_cobradas",
      etiqueta: "Señas cobradas",
      montoCentavos: totalSenas,
      cuenta: `${senas.length} ${senas.length === 1 ? "seña" : "señas"} pagadas antes del turno`,
      sumaAlTotal: false,
    },
  ];
}
