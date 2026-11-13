import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, conversations, crmSettings, deals, messages, pipelineStages, pipelines } from "@/db/schema";
import { resolveDefaultTenantId } from "@/lib/tenants";
import type { ModuloServidor } from "@/lib/modules/types";
import manifiesto from "./manifiesto";
import { ajustes, citas } from "./lib/tablas";
import { generar, SERVICIOS } from "./lib/generar";

/**
 * Seed de la demo Estudio Norte. Idempotente por una marca en `crm_settings`: la segunda
 * corrida no duplica nada. Inserta en lotes (son ~1.800 consultas y ~11.000 mensajes) y
 * sin disparar automatizaciones: es historia, no actividad nueva.
 */
const MARCA = "estudio_norte.seed";
const LOTE = 800;

async function enLotes<T>(filas: T[], insertar: (lote: T[]) => Promise<unknown>) {
  for (let k = 0; k < filas.length; k += LOTE) await insertar(filas.slice(k, k + LOTE));
}

async function configurarAgenda() {
  const valores = {
    dias: [1, 2, 3, 4, 5, 6],
    desde: "09:00",
    hasta: "19:00",
    duracionMin: 60,
    anticipacionMin: 60,
    diasAdelante: 7,
    titulo: "Turno",
    descripcion: "Turno en Estudio Norte (Palermo).",
    servicios: SERVICIOS.map((s) => ({ nombre: s.nombre, precioCentavos: s.precioCentavos, duracionMin: 60 })),
    senaPorcentaje: 30,
    senaPlazoMin: 60,
    recordatorioActivo: true,
    recordatorioHorasAntes: 24,
    proveedorPago: "simulado",
    updatedAt: new Date(),
  };
  await db.insert(ajustes).values({ id: "default", ...valores }).onConflictDoUpdate({ target: ajustes.id, set: valores });
}

async function sembrar() {
  const [hecho] = await db.select().from(crmSettings).where(eq(crmSettings.key, MARCA)).limit(1);
  // La agenda se configura siempre (por si alguien la toco); los datos, una sola vez.
  await configurarAgenda();
  if (hecho) return;

  // La carga demo del nucleo corre antes y deja 12 contactos genericos (con montos de
  // inmobiliaria): se borran para que todo lo que se ve sea de Estudio Norte. En cascada
  // se van sus conversaciones, mensajes, operaciones y actividades.
  await db.delete(contacts).where(sql`'demo' = any(${contacts.tags}) and ${contacts.source} <> 'simulador'`);

  const tenantId = await resolveDefaultTenantId();
  const ahora = Date.now();
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const idCita = new Map<number, string>();
  const filas = generar(ahora, (i) => {
    const id = randomUUID();
    idCita.set(i, id);
    return `${base}/m/agenda/publico/pago/${id}`;
  });

  const [pipeline] = await db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  const etapas = pipeline
    ? await db.select({ id: pipelineStages.id, key: pipelineStages.key }).from(pipelineStages).where(eq(pipelineStages.pipelineId, pipeline.id))
    : [];
  const etapaId = new Map(etapas.map((e) => [e.key, e.id]));

  const filasContactos: (typeof contacts.$inferInsert)[] = [];
  const filasConvs: (typeof conversations.$inferInsert)[] = [];
  const filasMsgs: (typeof messages.$inferInsert)[] = [];
  const filasDeals: (typeof deals.$inferInsert)[] = [];
  const filasCitas: (typeof citas.$inferInsert)[] = [];
  const filasActs: (typeof activities.$inferInsert)[] = [];

  for (const f of filas) {
    const contactId = randomUUID();
    const convId = randomUUID();
    const msgs = [...f.mensajes].sort((a, b) => a.at - b.at);
    const ultimo = msgs[msgs.length - 1];
    const ultimoIn = [...msgs].reverse().find((x) => x.dir === "in");
    const creada = new Date(f.creada);
    filasContactos.push({
      id: contactId,
      name: f.nombre,
      phone: f.telefono,
      source: f.canal,
      score: f.cita ? 80 : f.etapa === "calificado" ? 60 : 30,
      tags: ["demo"],
      customFields: f.campos,
      aiEnabled: true,
      needsHuman: f.derivada,
      tenantId,
      createdAt: creada,
      updatedAt: new Date(ultimo.at),
    });
    const ext = `demo:en:${f.i}`;
    filasConvs.push({
      id: convId,
      tenantId,
      contactId,
      channel: f.canal,
      provider: "simulador",
      externalId: ext,
      participantId: ext,
      participantName: f.nombre,
      participantHandle: f.canal === "instagram" ? f.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".") : null,
      status: "active",
      unreadCount: ultimo.dir === "in" ? 1 : 0,
      lastMessageAt: new Date(ultimo.at),
      lastMessageBody: ultimo.body,
      lastDirection: ultimo.dir,
      lastInboundAt: ultimoIn ? new Date(ultimoIn.at) : null,
      aiEnabled: !f.derivada,
      needsHuman: f.derivada,
      needsHumanReason: f.derivada ? "pidio hablar con una persona" : null,
      needsHumanAt: f.derivada ? new Date(msgs[1]?.at ?? f.creada) : null,
      createdAt: creada,
      updatedAt: new Date(ultimo.at),
    });
    msgs.forEach((x, k) => {
      const at = new Date(x.at);
      filasMsgs.push({
        id: randomUUID(),
        contactId,
        conversationId: convId,
        channel: f.canal,
        provider: "simulador",
        direction: x.dir,
        origin: x.dir === "out" ? (x.origen ?? "agent") : null,
        type: "text",
        body: x.body,
        externalId: `${ext}:${k}`,
        status: x.dir === "out" ? "sent" : "received",
        rawPayload: x.seguimiento ? { seguimiento: { paso: x.seguimiento } } : null,
        tenantId,
        sentAt: at,
        createdAt: at,
      });
    });
    if (f.etapa && etapaId.has(f.etapa)) {
      filasDeals.push({
        id: randomUUID(),
        title: f.nombre,
        value: f.valor,
        stageId: etapaId.get(f.etapa)!,
        contactId,
        probability: f.etapa === "cliente" ? 100 : f.etapa === "perdido" ? 0 : f.etapa === "turno_confirmado" ? 90 : 40,
        createdAt: creada,
        updatedAt: new Date(ultimo.at),
      });
    }
    const c = f.cita;
    if (c) {
      const id = idCita.get(f.i) ?? randomUUID();
      filasCitas.push({
        id,
        contactId,
        conversationId: convId,
        inicio: new Date(c.inicio),
        fin: new Date(c.inicio + 3600_000),
        estado: c.estado,
        titulo: `${c.servicio} · ${f.nombre}`,
        origen: "agente",
        servicio: c.servicio,
        precioCentavos: c.precio,
        senaCentavos: c.sena,
        senaVenceAt: new Date(c.senaVence),
        senaPagadaAt: c.senaPagada ? new Date(c.senaPagada) : null,
        pagoReferencia: `sim:${id}`,
        recordatorioEnviadoAt: c.recordatorio ? new Date(c.recordatorio) : null,
        confirmadaPorClienteAt: c.confirmo ? new Date(c.confirmo) : null,
        createdAt: new Date(c.creada),
        updatedAt: new Date(ultimo.at),
      });
      filasActs.push({ id: randomUUID(), type: "meeting", description: `El agente agendo ${c.servicio} · espera la sena`, contactId, createdAt: new Date(c.creada) });
      if (c.senaPagada) {
        filasActs.push({ id: randomUUID(), type: "meeting", description: `Sena pagada (USD ${c.sena / 100}): turno confirmado`, contactId, createdAt: new Date(c.senaPagada) });
      }
    }
  }

  await enLotes(filasContactos, (l) => db.insert(contacts).values(l));
  await enLotes(filasConvs, (l) => db.insert(conversations).values(l));
  await enLotes(filasMsgs, (l) => db.insert(messages).values(l));
  await enLotes(filasDeals, (l) => db.insert(deals).values(l));
  await enLotes(filasCitas, (l) => db.insert(citas).values(l));
  await enLotes(filasActs, (l) => db.insert(activities).values(l));
  await db.insert(crmSettings).values({ key: MARCA, value: new Date().toISOString() }).onConflictDoNothing();
}

const modulo: ModuloServidor = {
  manifiesto,
  seed: sembrar,
};

export default modulo;
