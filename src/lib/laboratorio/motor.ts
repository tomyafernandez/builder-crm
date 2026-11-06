import "server-only";
import { db } from "@/db";
import {
  contacts,
  conversations,
  crmSettings,
  deals,
  labCasos,
  labCorridas,
  messages,
  pipelineStages,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { ingestMessage, linkExtraIdentity, upsertConversation } from "@/lib/channels/ingest";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { runAgentForConversation } from "@/lib/agent";
import { getAgentConfig, saveAgentConfig } from "@/lib/agent/config";
import { getOpenRouterClient, getJudgeModel, hasOpenRouterKey } from "@/lib/agent/openrouter";
import { getSystemPromptTemplate, renderSystemPrompt, SYSTEM_PROMPT_SETTINGS_KEY } from "@/lib/agent/prompt";
import { getConfig } from "@/lib/config";
import type { PersonaLab } from "@/lib/config/schema";
import type { Channel } from "@/lib/channels/types";
import { PROVEEDOR_SIMULADOR } from "@/lib/simulador";
import { ETIQUETA_LABORATORIO } from "./constantes";
import { personasDeLaInstancia } from "./personas";
import {
  SISTEMA_JUEZ,
  armarPedidoJuez,
  calcularPuntaje,
  interpretarVeredicto,
  veredictoSinRespuesta,
  type TurnoTranscripcion,
  type Veredicto,
} from "./juez";

/**
 * Motor del Laboratorio (spec nucleo/17).
 *
 * Una corrida avanza de a UN paso por llamada (una linea del guion, o el juicio de un
 * caso): asi ninguna peticion pasa de unos segundos, funciona igual en Vercel y en
 * Coolify, y si alguien cierra la pestana la corrida queda donde estaba. La pantalla
 * llama a `avanzarCorrida` en bucle hasta que termina.
 *
 * Garantias:
 *   - Nada sale a la red: las conversaciones son del simulador (`provider = simulador`),
 *     cuyo conector no envia nada, y `deliverMessage` lo sabe.
 *   - No ensucia el CRM: los contactos van con source 'simulador' (fuera de reportes) y
 *     etiqueta 'laboratorio' (fuera de la bandeja y de las automatizaciones), y se BORRAN
 *     al juzgar cada caso; la conversacion queda copiada en `lab_casos`.
 */

const ABANDONADA_MS = 60 * 60 * 1000;
const MAX_INTENTOS_JUEZ = 2;

export interface ResumenCorrida {
  id: string;
  channel: string;
  estado: string;
  puntaje: number | null;
  modelo: string | null;
  modeloJuez: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  error: string | null;
  total: number;
  hechos: number;
}

export async function iniciarCorrida(input: {
  channel: Channel;
  creadoPor: string | null;
}): Promise<{ id: string } | { error: string }> {
  if (!hasOpenRouterKey()) {
    return { error: "Falta OPENROUTER_API_KEY: sin proveedor de IA no hay agente que probar ni juez." };
  }
  await limpiarRestos();

  const config = await getAgentConfig(input.channel);
  const personas = personasDeLaInstancia();
  const tenantId = await resolveDefaultTenantId();

  const [corrida] = await db
    .insert(labCorridas)
    .values({
      tenantId,
      channel: input.channel,
      estado: "en_curso",
      modelo: config.model,
      modeloJuez: getJudgeModel(),
      prompt: config.systemPrompt,
      creadoPor: input.creadoPor,
    })
    .returning({ id: labCorridas.id });

  await db.insert(labCasos).values(
    personas.map((p, i) => ({
      corridaId: corrida.id,
      orden: i,
      personaClave: p.clave,
      personaNombre: p.nombre,
      persona: p as unknown as Record<string, unknown>,
    }))
  );

  return { id: corrida.id };
}

/** Un paso. Devuelve el resumen actualizado (estado en_curso hasta que termina). */
export async function avanzarCorrida(corridaId: string): Promise<ResumenCorrida | null> {
  const [corrida] = await db.select().from(labCorridas).where(eq(labCorridas.id, corridaId)).limit(1);
  if (!corrida) return null;
  if (corrida.estado !== "en_curso") return resumir(corridaId);

  const [caso] = await db
    .select()
    .from(labCasos)
    .where(and(eq(labCasos.corridaId, corridaId), inArray(labCasos.estado, ["pendiente", "conversando", "juzgar"])))
    .orderBy(asc(labCasos.orden))
    .limit(1);

  if (!caso) {
    await cerrarCorrida(corridaId);
    return resumir(corridaId);
  }

  const persona = caso.persona as unknown as PersonaLab;
  const channel = corrida.channel as Channel;

  try {
    if (caso.estado === "pendiente") {
      const conversationId = await crearHiloDePrueba(persona, channel, corrida.creadoPor);
      await db
        .update(labCasos)
        .set({ conversationId, estado: "conversando", updatedAt: new Date() })
        .where(eq(labCasos.id, caso.id));
    } else if (caso.estado === "conversando") {
      await conversarUnPaso(caso.id, caso.conversationId, persona, caso.paso);
    } else {
      await juzgarCaso(caso.id, caso.conversationId, persona, channel, corrida.prompt ?? "");
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error(`[laboratorio] fallo el caso ${persona.clave}:`, detalle);
    // Un 401/402 del proveedor tumba toda la corrida: los demas casos fallarian igual.
    if (/401|402|api key|credit|saldo/i.test(detalle)) {
      await db
        .update(labCorridas)
        .set({ estado: "fallida", error: detalle.slice(0, 300), finishedAt: new Date() })
        .where(eq(labCorridas.id, corridaId));
      await borrarContactosDeCorrida(corridaId);
    } else {
      await db
        .update(labCasos)
        .set({ estado: "fallo", error: detalle.slice(0, 300), updatedAt: new Date() })
        .where(eq(labCasos.id, caso.id));
      await borrarContactoDeCaso(caso.conversationId);
    }
  }

  return resumir(corridaId);
}

async function crearHiloDePrueba(persona: PersonaLab, channel: Channel, ownerId: string | null): Promise<string> {
  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) throw new Error("No existe el tenant default (correr las migraciones)");
  const externalId = `lab:${crypto.randomUUID()}`;
  const nombre = `[Laboratorio] ${persona.nombre}`;
  const now = new Date();

  // Sin emitContactCreated ni assignContact a proposito: nada de automatizaciones ni
  // avisos al equipo. El dueno queda directo en la fila para que un asesor que corra el
  // Laboratorio vea su propio caso.
  const [contact] = await db
    .insert(contacts)
    .values({
      name: nombre,
      source: "simulador",
      tags: ["simulador", ETIQUETA_LABORATORIO],
      ownerId,
      tenantId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: contacts.id });

  await linkExtraIdentity(contact.id, channel, externalId, null);
  const conversation = await upsertConversation({
    tenantId,
    contactId: contact.id,
    accountId: null,
    channel,
    provider: PROVEEDOR_SIMULADOR,
    externalId,
    participantId: externalId,
    participantName: nombre,
    participantHandle: null,
    participantPicture: null,
  });
  return conversation.id;
}

async function conversarUnPaso(casoId: string, conversationId: string | null, persona: PersonaLab, paso: number) {
  if (!conversationId) throw new Error("El caso perdio su conversacion");
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conv) throw new Error("El caso perdio su conversacion");

  const linea = persona.guion[paso];
  if (linea !== undefined) {
    await ingestMessage({
      conversation: conv,
      direction: "in",
      externalId: `lab:in:${crypto.randomUUID()}`,
      body: linea,
      type: "text",
      enqueueAgent: false,
    });
    await runAgentForConversation(conv.id, { ignorarInterruptor: true });
  }

  const siguiente = paso + 1;
  // Si el agente derivo a una persona, el resto del guion no tiene quien lo conteste:
  // se juzga lo que hubo (derivar puede ser justo lo correcto).
  const [despues] = await db
    .select({ needsHuman: conversations.needsHuman })
    .from(conversations)
    .where(eq(conversations.id, conv.id))
    .limit(1);
  const termino = siguiente >= persona.guion.length || Boolean(despues?.needsHuman);

  await db
    .update(labCasos)
    .set({ paso: siguiente, estado: termino ? "juzgar" : "conversando", updatedAt: new Date() })
    .where(eq(labCasos.id, casoId));
}

async function transcripcionDe(conversationId: string): Promise<TurnoTranscripcion[]> {
  const filas = await db
    .select({ direction: messages.direction, origin: messages.origin, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  return filas
    .filter((f) => f.body?.trim())
    .map((f) => ({
      rol: f.direction === "in" ? ("cliente" as const) : f.origin === "agent" ? ("agente" as const) : ("persona" as const),
      texto: f.body!.trim(),
    }));
}

async function estadoFinalDe(conversationId: string): Promise<Record<string, unknown>> {
  const [conv] = await db
    .select({ contactId: conversations.contactId, needsHuman: conversations.needsHuman, motivo: conversations.needsHumanReason })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv?.contactId) return {};
  const [c] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId)).limit(1);
  const ops = await db
    .select({ etapa: pipelineStages.name })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(eq(deals.contactId, conv.contactId))
    .orderBy(desc(deals.updatedAt));
  return {
    nombre: c?.name ?? null,
    email: c?.email ?? null,
    etapa: ops[0]?.etapa ?? null,
    campos: (c?.customFields as Record<string, unknown> | null) ?? {},
    resumen: c?.aiSummary ?? null,
    derivadoAPersona: Boolean(conv.needsHuman),
    motivoDerivacion: conv.motivo ?? null,
  };
}

async function juzgarCaso(
  casoId: string,
  conversationId: string | null,
  persona: PersonaLab,
  channel: Channel,
  promptProbado: string
) {
  if (!conversationId) throw new Error("El caso perdio su conversacion");
  const transcripcion = await transcripcionDe(conversationId);
  const estadoFinal = await estadoFinalDe(conversationId);

  let veredicto: Veredicto | null = veredictoSinRespuesta(transcripcion);
  if (!veredicto) {
    const conocimiento = renderSystemPrompt(promptProbado, { channel });
    const pedido = armarPedidoJuez({ conocimiento, persona, transcripcion, estadoFinal });
    const client = getOpenRouterClient();
    for (let intento = 0; intento < MAX_INTENTOS_JUEZ && !veredicto; intento++) {
      const r = await client.chat.completions.create({
        model: getJudgeModel(),
        messages: [
          { role: "system", content: SISTEMA_JUEZ },
          { role: "user", content: pedido },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_completion_tokens: 1200,
      });
      veredicto = interpretarVeredicto(r.choices[0]?.message?.content);
    }
  }

  await db
    .update(labCasos)
    .set({
      estado: veredicto ? "listo" : "juez_fallo",
      veredicto: veredicto?.veredicto ?? null,
      hallazgos: (veredicto?.hallazgos ?? []) as unknown as Record<string, unknown>[],
      resumen: veredicto?.resumen ?? "El juez no devolvio un veredicto valido; el caso no cuenta para el puntaje.",
      transcripcion: transcripcion as unknown as Record<string, unknown>[],
      estadoFinal,
      updatedAt: new Date(),
    })
    .where(eq(labCasos.id, casoId));

  await borrarContactoDeCaso(conversationId);
}

async function cerrarCorrida(corridaId: string) {
  const casos = await db.select({ veredicto: labCasos.veredicto }).from(labCasos).where(eq(labCasos.corridaId, corridaId));
  const puntaje = calcularPuntaje(casos);
  await db
    .update(labCorridas)
    .set({
      estado: puntaje === null ? "fallida" : "terminada",
      puntaje,
      error: puntaje === null ? "Ningun caso pudo evaluarse." : null,
      finishedAt: new Date(),
    })
    .where(eq(labCorridas.id, corridaId));
}

async function borrarContactoDeCaso(conversationId: string | null) {
  if (!conversationId) return;
  const [conv] = await db
    .select({ contactId: conversations.contactId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv?.contactId) return;
  // Solo contactos del Laboratorio: nunca borrar uno real por un id equivocado.
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, conv.contactId), sql`${contacts.tags} @> array[${ETIQUETA_LABORATORIO}]::text[]`));
}

async function borrarContactosDeCorrida(corridaId: string) {
  const casos = await db.select({ conv: labCasos.conversationId }).from(labCasos).where(eq(labCasos.corridaId, corridaId));
  for (const c of casos) await borrarContactoDeCaso(c.conv);
}

/** Corridas abandonadas (> 1 h en curso) pasan a fallidas y se borran sus contactos. */
async function limpiarRestos() {
  const viejas = await db
    .select({ id: labCorridas.id })
    .from(labCorridas)
    .where(and(eq(labCorridas.estado, "en_curso"), lt(labCorridas.createdAt, new Date(Date.now() - ABANDONADA_MS))));
  for (const v of viejas) {
    await db
      .update(labCorridas)
      .set({ estado: "fallida", error: "Abandonada: nadie la termino en una hora.", finishedAt: new Date() })
      .where(eq(labCorridas.id, v.id));
    await borrarContactosDeCorrida(v.id);
  }
}

export async function cancelarCorrida(corridaId: string): Promise<boolean> {
  const r = await db
    .update(labCorridas)
    .set({ estado: "fallida", error: "Cancelada.", finishedAt: new Date() })
    .where(and(eq(labCorridas.id, corridaId), eq(labCorridas.estado, "en_curso")))
    .returning({ id: labCorridas.id });
  await borrarContactosDeCorrida(corridaId);
  return r.length > 0;
}

async function resumir(corridaId: string): Promise<ResumenCorrida | null> {
  const [c] = await db.select().from(labCorridas).where(eq(labCorridas.id, corridaId)).limit(1);
  if (!c) return null;
  const casos = await db.select({ estado: labCasos.estado }).from(labCasos).where(eq(labCasos.corridaId, corridaId));
  return {
    id: c.id,
    channel: c.channel,
    estado: c.estado,
    puntaje: c.puntaje,
    modelo: c.modelo,
    modeloJuez: c.modeloJuez,
    createdAt: c.createdAt,
    finishedAt: c.finishedAt,
    error: c.error,
    total: casos.length,
    hechos: casos.filter((x) => ["listo", "juez_fallo", "fallo"].includes(x.estado)).length,
  };
}

export async function listarCorridas(limit = 20): Promise<ResumenCorrida[]> {
  const filas = await db.select({ id: labCorridas.id }).from(labCorridas).orderBy(desc(labCorridas.createdAt)).limit(limit);
  const res = await Promise.all(filas.map((f) => resumir(f.id)));
  return res.filter((r): r is ResumenCorrida => r !== null);
}

export async function obtenerCorrida(corridaId: string) {
  const resumen = await resumir(corridaId);
  if (!resumen) return null;
  const casos = await db
    .select({
      id: labCasos.id,
      orden: labCasos.orden,
      personaClave: labCasos.personaClave,
      personaNombre: labCasos.personaNombre,
      persona: labCasos.persona,
      estado: labCasos.estado,
      veredicto: labCasos.veredicto,
      hallazgos: labCasos.hallazgos,
      resumen: labCasos.resumen,
      transcripcion: labCasos.transcripcion,
      estadoFinal: labCasos.estadoFinal,
      error: labCasos.error,
    })
    .from(labCasos)
    .where(eq(labCasos.corridaId, corridaId))
    .orderBy(asc(labCasos.orden));
  // Para comparar: el puntaje de la corrida terminada anterior del mismo canal.
  const [anterior] = await db
    .select({ puntaje: labCorridas.puntaje })
    .from(labCorridas)
    .where(
      and(
        eq(labCorridas.channel, resumen.channel),
        eq(labCorridas.estado, "terminada"),
        lt(labCorridas.createdAt, resumen.createdAt)
      )
    )
    .orderBy(desc(labCorridas.createdAt))
    .limit(1);
  return { ...resumen, puntajeAnterior: anterior?.puntaje ?? null, casos };
}

/** Ultima corrida terminada de un canal (para el umbral de encendido). */
export async function ultimaCorridaTerminada(channel: Channel) {
  const [c] = await db
    .select({ id: labCorridas.id, puntaje: labCorridas.puntaje, finishedAt: labCorridas.finishedAt })
    .from(labCorridas)
    .where(and(eq(labCorridas.channel, channel), eq(labCorridas.estado, "terminada")))
    .orderBy(desc(labCorridas.createdAt))
    .limit(1);
  return c ?? null;
}

/**
 * Spec nucleo/17 (D5): ¿se puede encender el agente en este canal? Solo pregunta si la
 * instancia lo exige (`laboratorio.exigir`).
 */
export async function puedeEncender(channel: Channel): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { exigir, puntajeMinimo } = getConfig().laboratorio;
  if (!exigir) return { ok: true };
  return decidirEncendido(puntajeMinimo, await ultimaCorridaTerminada(channel));
}

/** Pura: la regla del umbral, separada para poder probarla sin base. */
export function decidirEncendido(
  puntajeMinimo: number,
  ultima: { puntaje: number | null } | null
): { ok: true } | { ok: false; motivo: string } {
  if (!ultima || ultima.puntaje === null) {
    return { ok: false, motivo: `Antes de encender el agente, corre el Laboratorio en este canal (minimo ${puntajeMinimo}/100).` };
  }
  if (ultima.puntaje < puntajeMinimo) {
    return {
      ok: false,
      motivo: `La ultima corrida del Laboratorio saco ${ultima.puntaje}/100 y el minimo es ${puntajeMinimo}. Corregi los hallazgos y volve a correrlo.`,
    };
  }
  return { ok: true };
}

export const ENCABEZADO_CONOCIMIENTO = "# PREGUNTAS FRECUENTES (agregadas desde el Laboratorio)";

/** Agrega una pregunta y respuesta al bloque de preguntas frecuentes del prompt. */
export function agregarPreguntaAlPrompt(prompt: string, pregunta: string, respuesta: string): string {
  const linea = `- P: ${pregunta.trim()}\n  R: ${respuesta.trim()}`;
  if (prompt.includes(ENCABEZADO_CONOCIMIENTO)) {
    return prompt.replace(ENCABEZADO_CONOCIMIENTO, `${ENCABEZADO_CONOCIMIENTO}\n${linea}`);
  }
  return `${prompt.trimEnd()}\n\n${ENCABEZADO_CONOCIMIENTO}\n${linea}`;
}

/**
 * Aplica una sugerencia del juez al prompt que usa ese canal: el propio del canal si lo
 * tiene, si no el global de Ajustes. La respuesta la confirma (y corrige) una persona en
 * pantalla antes de llegar aca: el juez puede no conocer el dato real.
 */
export async function aplicarSugerencia(input: {
  channel: Channel;
  pregunta: string;
  respuesta: string;
}): Promise<{ destino: "canal" | "global" }> {
  const config = await getAgentConfig(input.channel);
  if (!config.promptInherited) {
    await saveAgentConfig(input.channel, {
      systemPrompt: agregarPreguntaAlPrompt(config.systemPrompt, input.pregunta, input.respuesta),
    });
    return { destino: "canal" };
  }
  const global = await getSystemPromptTemplate();
  const nuevo = agregarPreguntaAlPrompt(global, input.pregunta, input.respuesta);
  await db
    .insert(crmSettings)
    .values({ key: SYSTEM_PROMPT_SETTINGS_KEY, value: nuevo })
    .onConflictDoUpdate({ target: crmSettings.key, set: { value: nuevo } });
  return { destino: "global" };
}
