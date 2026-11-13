import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, messages } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { modulosActivos } from "@/lib/modules";
import { conversacionesRecuperadas } from "@/lib/seguimiento/decidir";
import type { MetricaRetorno } from "@/lib/modules/types";
import { armarRetorno, type Retorno } from "./retorno";

/**
 * Junta los datos de la tarjeta de retorno (spec nucleo/19). Igual que Reportes, deja
 * afuera a los contactos creados desde /simulador y a los del Laboratorio.
 */
const contactoReal = sql`${contacts.source} <> 'simulador' and not ('laboratorio' = any(${contacts.tags}))`;

export async function retornoDelPanel(dias = 30): Promise<Retorno | null> {
  const config = getConfig();
  if (!config.retorno.activo) return null;
  const desde = new Date(Date.now() - dias * 86_400_000);

  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(contacts, eq(contacts.id, messages.contactId))
    .where(and(eq(messages.direction, "out"), eq(messages.origin, "agent"), gte(messages.createdAt, desde), contactoReal));
  const mensajesAgente = Number(fila?.n ?? 0);

  // Conversaciones recuperadas por el seguimiento en el periodo (las mide el nucleo).
  const conSeg = await db
    .selectDistinct({ id: messages.conversationId })
    .from(messages)
    .innerJoin(contacts, eq(contacts.id, messages.contactId))
    .where(and(gte(messages.createdAt, desde), sql`${messages.rawPayload} ? 'seguimiento'`, contactoReal));
  const ids = conSeg.map((x) => x.id).filter((x): x is string => Boolean(x));
  const filas = ids.length
    ? await db
        .select({ conversationId: messages.conversationId, direction: messages.direction, createdAt: messages.createdAt, rawPayload: messages.rawPayload })
        .from(messages)
        .where(and(inArray(messages.conversationId, ids), gte(messages.createdAt, desde)))
    : [];
  const recuperadas = conversacionesRecuperadas(filas);

  const lineasModulos: MetricaRetorno[] = [];
  for (const m of modulosActivos()) {
    if (!m.metricasPanel) continue;
    try {
      lineasModulos.push(
        ...(await m.metricasPanel(dias, {
          retorno: { minutosPorMensaje: config.retorno.minutosPorMensaje, tasaAusencia: config.retorno.tasaAusencia },
          conversacionesRecuperadas: recuperadas,
        }))
      );
    } catch (err) {
      console.error(`[retorno] el modulo ${m.manifiesto.nombre} fallo:`, err instanceof Error ? err.message : err);
    }
  }

  return armarRetorno({ dias, mensajesAgente, minutosPorMensaje: config.retorno.minutosPorMensaje, recuperadas: recuperadas.length, lineasModulos });
}
