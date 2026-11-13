import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, deals, messages, pipelineStages } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { deliverMessage } from "@/lib/channels/deliver";
import { getAgentConfig } from "@/lib/agent/config";
import { getOpenRouterClient, hasOpenRouterKey } from "@/lib/agent/openrouter";
import { renderSystemPrompt } from "@/lib/agent/prompt";
import { pulirTexto } from "@/lib/agent/estilo";
import type { Channel } from "@/lib/channels/types";
import { PROVEEDOR_SIMULADOR } from "@/lib/simulador";
import { decidirSeguimiento, medirSeguimientos, type Decision } from "./decidir";

/**
 * Motor del seguimiento automatico (spec nucleo/18). Lo corre el barrido cada
 * SWEEP_INTERVAL_MIN (Coolify) o el cron (Vercel), y el boton "Correr ahora".
 *
 * Por cada conversacion reciente decide con `decidirSeguimiento` y, si toca, redacta
 * el mensaje con el agente del canal (sabe lo que el cliente pregunto y la informacion
 * del negocio) y lo envia por `deliverMessage`, el unico camino de salida: respeta la
 * lista de numeros permitidos y el conector de cada canal.
 */

const VENTANA_BUSQUEDA_DIAS = 31;
const MAX_POR_CORRIDA = 10;
const PRESUPUESTO_MS = 45_000;

export interface ResultadoCorrida {
  revisadas: number;
  enviados: number;
  errores: number;
  detalle: Array<{ conversationId: string; contacto: string | null; resultado: string }>;
}

async function candidatas(soloSimulador: boolean) {
  const desde = new Date(Date.now() - VENTANA_BUSQUEDA_DIAS * 86_400_000);
  return db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      provider: conversations.provider,
      lastInboundAt: conversations.lastInboundAt,
      needsHuman: conversations.needsHuman,
      aiEnabled: conversations.aiEnabled,
      contactId: conversations.contactId,
      contactName: contacts.name,
      contactAi: contacts.aiEnabled,
      tags: contacts.tags,
    })
    .from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(
      and(
        isNotNull(conversations.lastInboundAt),
        gte(conversations.lastInboundAt, desde),
        eq(conversations.needsHuman, false),
        // Spec nucleo/19 (D5): la prueba toca solo lo creado desde /simulador, no los datos
        // demo (tambien son del simulador): con cientos sembrados, cada prueba redactaria
        // decenas de mensajes con el modelo.
        soloSimulador ? and(eq(conversations.provider, PROVEEDOR_SIMULADOR), eq(contacts.source, "simulador")) : undefined
      )
    )
    .orderBy(desc(conversations.lastInboundAt))
    .limit(300);
}

async function etapaDe(contactId: string | null) {
  if (!contactId) return null;
  const [d] = await db
    .select({ clave: pipelineStages.key, ganada: pipelineStages.isWon, perdida: pipelineStages.isLost })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(eq(deals.contactId, contactId))
    .orderBy(desc(deals.updatedAt))
    .limit(1);
  return d ?? null;
}

async function hilo(conversationId: string) {
  return db
    .select({ direction: messages.direction, body: messages.body, origin: messages.origin, createdAt: messages.createdAt, rawPayload: messages.rawPayload })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(30);
}

/** Redacta el seguimiento con el agente del canal. null si no pudo. */
async function redactar(
  channel: Channel,
  filas: Awaited<ReturnType<typeof hilo>>,
  paso: number,
  total: number
): Promise<string | null> {
  if (!hasOpenRouterKey()) return null;
  const agente = await getAgentConfig(channel);
  const extra = getConfig().seguimiento.instrucciones;
  const sistema = `${renderSystemPrompt(agente.systemPrompt, { channel })}

# SEGUIMIENTO (paso ${paso} de ${total})
El cliente dejo de responder. Escribile UN mensaje breve (1 o 2 oraciones) para retomar la conversacion:
- Retoma lo que el pregunto o lo ultimo que se hablo, con sus palabras. Nada generico.
- Termina con una pregunta simple que lo acerque al siguiente paso.
- Sin presionar, sin repetir lo que ya se dijo, sin disculparte por escribir.
- ${paso === total ? "Es el ultimo seguimiento: deja la puerta abierta con amabilidad." : "Todavia no es el ultimo: no te despidas."}
${extra ? `- ${extra}` : ""}
Responde solo con el texto del mensaje.`;
  const historia = [...filas]
    .reverse()
    .filter((f) => f.body?.trim())
    .map((f) => ({ role: f.direction === "in" ? ("user" as const) : ("assistant" as const), content: f.body!.trim() }));
  const r = await getOpenRouterClient().chat.completions.create({
    model: agente.model,
    messages: [{ role: "system", content: sistema }, ...historia],
    temperature: 0.5,
    max_completion_tokens: 300,
  });
  const texto = r.choices[0]?.message?.content?.trim();
  return texto ? pulirTexto(texto.replace(/^["“]|["”]$/g, ""), { sinSignosApertura: getConfig().agente.sinSignosApertura }) : null;
}

export async function correrSeguimientos(opciones: { soloSimulador?: boolean; ignorarEspera?: boolean } = {}): Promise<ResultadoCorrida> {
  const config = getConfig();
  const inicio = Date.now();
  const res: ResultadoCorrida = { revisadas: 0, enviados: 0, errores: 0, detalle: [] };
  if (!config.seguimiento.activo) return res;

  const lista = await candidatas(Boolean(opciones.soloSimulador));
  for (const c of lista) {
    if (res.enviados >= MAX_POR_CORRIDA || Date.now() - inicio > PRESUPUESTO_MS) break;
    res.revisadas++;
    const filas = await hilo(c.id);
    const decision: Decision = decidirSeguimiento({
      ahora: new Date(),
      zona: config.zonaHoraria,
      config: config.seguimiento,
      conversacion: { channel: c.channel, lastInboundAt: c.lastInboundAt, needsHuman: c.needsHuman, aiEnabled: c.aiEnabled },
      contacto: { aiEnabled: c.contactAi ?? true, tags: c.tags ?? [] },
      etapa: await etapaDe(c.contactId),
      mensajes: filas,
      // La espera se ignora SOLO en el simulador (boton de prueba): nunca con clientes reales.
      ignorarEspera: Boolean(opciones.ignorarEspera) && c.provider === PROVEEDOR_SIMULADOR,
    });
    if (!decision.enviar) continue;

    try {
      const entrega =
        decision.modo === "texto"
          ? await (async () => {
              const texto = await redactar(c.channel as Channel, filas, decision.paso, decision.total);
              if (!texto) return { ok: false as const, error: "no se pudo redactar" };
              return deliverMessage(c.id, { text: texto }, "agent", { leidoHasta: c.lastInboundAt, seguimiento: decision.paso });
            })()
          : await deliverMessage(
              c.id,
              { template: { name: decision.plantilla!, language: decision.idioma } },
              "template",
              { seguimiento: decision.paso }
            );
      if (entrega.ok) {
        res.enviados++;
        res.detalle.push({ conversationId: c.id, contacto: c.contactName, resultado: `seguimiento ${decision.paso} de ${decision.total} enviado` });
      } else {
        res.errores++;
        res.detalle.push({ conversationId: c.id, contacto: c.contactName, resultado: `no se envio: ${entrega.error ?? "error"}` });
      }
    } catch (err) {
      res.errores++;
      res.detalle.push({ conversationId: c.id, contacto: c.contactName, resultado: `error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return res;
}

/** Panel: lo enviado y lo recuperado en los ultimos `dias`, y las proximas. */
export async function resumenSeguimientos(dias = 30) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  // Conversaciones que recibieron algun seguimiento en el periodo.
  const conSeg = await db
    .selectDistinct({ id: messages.conversationId })
    .from(messages)
    .where(and(gte(messages.createdAt, desde), sql`${messages.rawPayload} ? 'seguimiento'`));
  const ids = conSeg.map((x) => x.id).filter((x): x is string => Boolean(x));
  const filas = ids.length
    ? await db
        .select({ conversationId: messages.conversationId, direction: messages.direction, createdAt: messages.createdAt, rawPayload: messages.rawPayload })
        .from(messages)
        .where(and(inArray(messages.conversationId, ids), gte(messages.createdAt, desde)))
    : [];
  const metricas = medirSeguimientos(filas);

  const recientes = ids.length
    ? await db
        .select({
          conversationId: messages.conversationId,
          body: messages.body,
          createdAt: messages.createdAt,
          rawPayload: messages.rawPayload,
          contactName: contacts.name,
        })
        .from(messages)
        .leftJoin(contacts, eq(contacts.id, messages.contactId))
        .where(and(inArray(messages.conversationId, ids), sql`${messages.rawPayload} ? 'seguimiento'`))
        .orderBy(desc(messages.createdAt))
        .limit(20)
    : [];

  // Proximas: las que hoy esperan, con el motivo (solo lectura).
  const config = getConfig();
  const lista = await candidatas(false);
  const esperando: Array<{ conversationId: string; contacto: string | null; motivo: string }> = [];
  for (const c of lista.slice(0, 60)) {
    const filasHilo = await hilo(c.id);
    const d = decidirSeguimiento({
      ahora: new Date(),
      zona: config.zonaHoraria,
      config: { ...config.seguimiento, activo: true },
      conversacion: { channel: c.channel, lastInboundAt: c.lastInboundAt, needsHuman: c.needsHuman, aiEnabled: c.aiEnabled },
      contacto: { aiEnabled: c.contactAi ?? true, tags: c.tags ?? [] },
      etapa: await etapaDe(c.contactId),
      mensajes: filasHilo,
    });
    if (d.enviar) esperando.push({ conversationId: c.id, contacto: c.contactName, motivo: `listo para el seguimiento ${d.paso}` });
    else if (d.motivo === "todavia no") esperando.push({ conversationId: c.id, contacto: c.contactName, motivo: "esperando el plazo" });
  }

  return {
    activo: config.seguimiento.activo,
    pasos: config.seguimiento.pasos,
    horario: config.seguimiento.horario,
    dias,
    ...metricas,
    recientes: recientes.map((r) => ({
      conversationId: r.conversationId,
      contacto: r.contactName,
      texto: r.body,
      paso: (r.rawPayload as { seguimiento?: { paso?: number } } | null)?.seguimiento?.paso ?? null,
      createdAt: r.createdAt,
    })),
    esperando: esperando.slice(0, 20),
  };
}
