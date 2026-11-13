/**
 * Decide si a una conversacion le toca un seguimiento AHORA (spec nucleo/18). PURA: sin
 * base ni red, para poder probar cada regla. El motor (motor.ts) junta los datos y
 * llama a esta funcion; si dice que si, redacta y envia.
 */

export interface PasoSeguimiento {
  trasHoras: number;
  plantilla?: string;
  idiomaPlantilla?: string;
}

export interface ConfigSeguimiento {
  activo: boolean;
  pasos: PasoSeguimiento[];
  horario: { desde: string; hasta: string };
  etapasSinSeguimiento: string[];
}

export interface MensajeHilo {
  direction: string;
  createdAt: Date;
  rawPayload: unknown;
}

export interface EntradaDecision {
  ahora: Date;
  zona: string;
  config: ConfigSeguimiento;
  conversacion: { channel: string; lastInboundAt: Date | null; needsHuman: boolean; aiEnabled: boolean };
  contacto: { aiEnabled: boolean; tags: string[] | null };
  etapa: { clave: string | null; ganada: boolean; perdida: boolean } | null;
  /** Mensajes recientes del hilo, en cualquier orden. */
  mensajes: MensajeHilo[];
  /** Solo para el boton de prueba del simulador: no espera las horas. */
  ignorarEspera?: boolean;
}

export type Decision =
  | { enviar: true; paso: number; total: number; modo: "texto" | "plantilla"; plantilla?: string; idioma?: string }
  | { enviar: false; motivo: string };

const VENTANA_MS = 24 * 3600_000;
/** No escribir un seguimiento pegado a otro mensaje nuestro. */
const SEPARACION_MIN_MS = 30 * 60_000;

/** Numero de paso si el mensaje es un seguimiento, o null. */
export function pasoDeSeguimiento(rawPayload: unknown): number | null {
  const s = (rawPayload as { seguimiento?: { paso?: unknown } } | null)?.seguimiento;
  return typeof s?.paso === "number" ? s.paso : null;
}

function minutosLocales(fecha: Date, zona: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(fecha)
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return Number(p.hour) * 60 + Number(p.minute);
}

const aMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function decidirSeguimiento(e: EntradaDecision): Decision {
  const { ahora, config, conversacion: c } = e;
  if (!config.activo) return { enviar: false, motivo: "apagado" };
  if (e.contacto.tags?.includes("laboratorio")) return { enviar: false, motivo: "laboratorio" };
  if (!c.lastInboundAt) return { enviar: false, motivo: "el cliente nunca escribio" };
  if (c.needsHuman) return { enviar: false, motivo: "derivada a una persona" };
  if (!c.aiEnabled || !e.contacto.aiEnabled) return { enviar: false, motivo: "agente pausado" };
  if (e.etapa?.ganada || e.etapa?.perdida) return { enviar: false, motivo: "etapa cerrada" };
  if (e.etapa?.clave && config.etapasSinSeguimiento.includes(e.etapa.clave)) {
    return { enviar: false, motivo: "etapa sin seguimiento" };
  }

  const ordenados = [...e.mensajes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const ultimo = ordenados[ordenados.length - 1];
  if (!ultimo) return { enviar: false, motivo: "sin mensajes" };
  // Si lo ultimo es del cliente, le toca responder al agente, no hacer seguimiento.
  if (ultimo.direction === "in") return { enviar: false, motivo: "el cliente escribio ultimo" };

  const ultimoEntrante = c.lastInboundAt;
  const enviados = ordenados.filter(
    (m) => m.direction === "out" && m.createdAt > ultimoEntrante && pasoDeSeguimiento(m.rawPayload) !== null
  ).length;
  if (enviados >= config.pasos.length) return { enviar: false, motivo: "seguimientos agotados" };

  const paso = config.pasos[enviados];
  const vence = ultimoEntrante.getTime() + paso.trasHoras * 3600_000;
  if (!e.ignorarEspera) {
    if (ahora.getTime() < vence) return { enviar: false, motivo: "todavia no" };
    if (ahora.getTime() - ultimo.createdAt.getTime() < SEPARACION_MIN_MS) {
      return { enviar: false, motivo: "mensaje nuestro muy reciente" };
    }
    const m = minutosLocales(ahora, e.zona);
    if (m < aMin(config.horario.desde) || m >= aMin(config.horario.hasta)) {
      return { enviar: false, motivo: "fuera de horario" };
    }
  }

  const total = config.pasos.length;
  if (ahora.getTime() - ultimoEntrante.getTime() < VENTANA_MS) {
    return { enviar: true, paso: enviados + 1, total, modo: "texto" };
  }
  if (c.channel === "whatsapp" && paso.plantilla) {
    return { enviar: true, paso: enviados + 1, total, modo: "plantilla", plantilla: paso.plantilla, idioma: paso.idiomaPlantilla ?? "es_AR" };
  }
  return {
    enviar: false,
    motivo: c.channel === "whatsapp" ? "fuera de las 24 h y sin plantilla" : "fuera de las 24 h (Instagram y Messenger no permiten)",
  };
}

/**
 * Para el retorno de la inversion: un seguimiento "recupero" la conversacion si despues
 * de el el cliente volvio a escribir. Recibe mensajes de muchas conversaciones.
 */
export function medirSeguimientos(mensajes: Array<MensajeHilo & { conversationId: string | null }>) {
  const porConv = new Map<string, MensajeHilo[]>();
  for (const m of mensajes) {
    if (!m.conversationId) continue;
    porConv.set(m.conversationId, [...(porConv.get(m.conversationId) ?? []), m]);
  }
  let enviados = 0;
  let conversacionesConSeguimiento = 0;
  let recuperadas = 0;
  for (const lista of porConv.values()) {
    const orden = lista.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const seg = orden.filter((m) => m.direction === "out" && pasoDeSeguimiento(m.rawPayload) !== null);
    if (seg.length === 0) continue;
    enviados += seg.length;
    conversacionesConSeguimiento++;
    const primero = seg[0].createdAt;
    if (orden.some((m) => m.direction === "in" && m.createdAt > primero)) recuperadas++;
  }
  return { enviados, conversacionesConSeguimiento, recuperadas };
}

/**
 * Ids de las conversaciones que un seguimiento "recupero" (spec nucleo/19, tarjeta de
 * retorno): misma regla que `medirSeguimientos`.
 */
export function conversacionesRecuperadas(mensajes: Array<MensajeHilo & { conversationId: string | null }>): string[] {
  const porConv = new Map<string, MensajeHilo[]>();
  for (const m of mensajes) {
    if (!m.conversationId) continue;
    porConv.set(m.conversationId, [...(porConv.get(m.conversationId) ?? []), m]);
  }
  const salida: string[] = [];
  for (const [id, lista] of porConv) {
    const orden = [...lista].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const primero = orden.find((m) => m.direction === "out" && pasoDeSeguimiento(m.rawPayload) !== null);
    if (primero && orden.some((m) => m.direction === "in" && m.createdAt > primero.createdAt)) salida.push(id);
  }
  return salida;
}
