/**
 * Reglas de la sena, el vencimiento y el recordatorio (spec nucleo/19). PURO: sin base ni
 * red, para poder probar cada regla. `servicio.ts` y `barrido.ts` juntan los datos y
 * llaman a estas funciones.
 */

import type { ServicioAgenda } from "../tabla";

export const ESTADOS_ACTIVOS = ["agendada", "pendiente_sena", "confirmada"] as const;
/** Los que ya no ocupan horario nunca. */
const LIBERAN = new Set(["cancelada", "vencida"]);

/** Etapas del pipeline que la agenda mueve si existen (por clave). */
export const ETAPA_SENA_PENDIENTE = "sena_pendiente";
export const ETAPA_TURNO_CONFIRMADO = "turno_confirmado";

export interface CitaParaReglas {
  estado: string;
  inicio: Date;
  fin: Date;
  senaVenceAt: Date | null;
  senaPagadaAt: Date | null;
}

/** Sena en centavos: `round(precio * porcentaje / 100)`. null = no hay sena. */
export function calcularSena(precioCentavos: number | null | undefined, porcentaje: number | null | undefined): number | null {
  if (porcentaje === null || porcentaje === undefined || porcentaje <= 0) return null;
  if (!precioCentavos || precioCentavos <= 0) return null;
  return Math.round((precioCentavos * Math.min(porcentaje, 100)) / 100);
}

/** Una reserva con sena sin pagar cuyo plazo ya paso. */
export function reservaVencida(c: Pick<CitaParaReglas, "estado" | "senaVenceAt" | "senaPagadaAt">, ahora: Date): boolean {
  return c.estado === "pendiente_sena" && !c.senaPagadaAt && Boolean(c.senaVenceAt) && c.senaVenceAt!.getTime() <= ahora.getTime();
}

/**
 * Si la cita ocupa su horario. Una `pendiente_sena` vencida ya NO ocupa aunque el barrido
 * todavia no la haya marcado: el horario no depende de que corra el cron.
 */
export function ocupaHorario(c: CitaParaReglas, ahora: Date): boolean {
  if (LIBERAN.has(c.estado)) return false;
  return !reservaVencida(c, ahora);
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Empareja lo que dijo el agente con un servicio. Ambiguo o nada -> null. */
export function buscarServicio(texto: string | null | undefined, servicios: ServicioAgenda[]): ServicioAgenda | null {
  const q = normalizar(texto ?? "");
  if (!q) return null;
  const exacto = servicios.find((s) => normalizar(s.nombre) === q);
  if (exacto) return exacto;
  const parciales = servicios.filter((s) => normalizar(s.nombre).includes(q) || q.includes(normalizar(s.nombre)));
  return parciales.length === 1 ? parciales[0] : null;
}

function partes(fecha: Date, zona: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(fecha)
      .map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** Dias de calendario (en la zona) entre dos instantes. */
function diasEntre(desde: Date, hasta: Date, zona: string): number {
  const a = partes(desde, zona);
  const b = partes(hasta, zona);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

function hora(fecha: Date, zona: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(fecha);
}

/** "hoy a las 17:00", "mañana a las 17:00" o "el jueves 13 a las 17:00", en la zona del negocio. */
export function cuandoRelativo(inicio: Date, ahora: Date, zona: string): string {
  const d = diasEntre(ahora, inicio, zona);
  if (d === 0) return `hoy a las ${hora(inicio, zona)}`;
  if (d === 1) return `mañana a las ${hora(inicio, zona)}`;
  const dia = new Intl.DateTimeFormat("es-AR", { timeZone: zona, weekday: "long", day: "numeric" }).format(inicio).replace(",", "");
  return `el ${dia} a las ${hora(inicio, zona)}`;
}

/** "sábado 14 de noviembre a las 14:00": como se lo dice una persona al cliente. */
export function fechaParaCliente(fecha: Date, zona: string): string {
  const dia = new Intl.DateTimeFormat("es-AR", { timeZone: zona, weekday: "long", day: "numeric", month: "long" }).format(fecha).replace(",", "");
  return `${dia} a las ${hora(fecha, zona)}`;
}

const VENTANA_MS = 24 * 3600_000;
const HORARIO_DESDE = 9 * 60;
const HORARIO_HASTA = 21 * 60;

export interface EntradaRecordatorio {
  ahora: Date;
  zona: string;
  activo: boolean;
  horasAntes: number;
  plantilla: string | null;
  cita: { estado: string; inicio: Date; recordatorioEnviadoAt: Date | null };
  conversacion: { channel: string; lastInboundAt: Date | null } | null;
  /** Boton de prueba: no espera a que falten las horas ni mira el horario. */
  ignorarEspera?: boolean;
}

export type DecisionRecordatorio =
  | { enviar: true; modo: "texto" | "plantilla"; plantilla?: string }
  | { enviar: false; motivo: string };

/**
 * Le toca el recordatorio AHORA? Una sola vez, a citas confirmadas (o agendadas sin sena),
 * cuando faltan `horasAntes` o menos, antes del inicio y entre 09:00 y 21:00 del negocio.
 * Dentro de la ventana de 24 h va texto; fuera, WhatsApp con plantilla y nada en
 * Instagram/Messenger (igual que el seguimiento).
 */
export function decidirRecordatorio(e: EntradaRecordatorio): DecisionRecordatorio {
  if (!e.activo) return { enviar: false, motivo: "recordatorio apagado" };
  if (e.cita.estado !== "confirmada" && e.cita.estado !== "agendada") return { enviar: false, motivo: "la cita no esta confirmada" };
  if (e.cita.recordatorioEnviadoAt) return { enviar: false, motivo: "ya se recordo" };
  if (!e.conversacion) return { enviar: false, motivo: "sin conversacion" };
  const falta = e.cita.inicio.getTime() - e.ahora.getTime();
  if (falta <= 0) return { enviar: false, motivo: "ya paso" };
  if (!e.ignorarEspera) {
    if (falta > e.horasAntes * 3600_000) return { enviar: false, motivo: "todavia no" };
    const p = partes(e.ahora, e.zona);
    const min = p.h * 60 + p.mi;
    if (min < HORARIO_DESDE || min >= HORARIO_HASTA) return { enviar: false, motivo: "fuera de horario" };
  }
  const c = e.conversacion;
  if (c.lastInboundAt && e.ahora.getTime() - c.lastInboundAt.getTime() < VENTANA_MS) return { enviar: true, modo: "texto" };
  if (c.channel === "whatsapp" && e.plantilla) return { enviar: true, modo: "plantilla", plantilla: e.plantilla };
  return {
    enviar: false,
    motivo: c.channel === "whatsapp" ? "fuera de las 24 h y sin plantilla" : "fuera de las 24 h (Instagram y Messenger no permiten)",
  };
}

/** Ventana de 24 h abierta (para avisos que no son recordatorio, como el vencimiento). */
export function ventanaAbierta(lastInboundAt: Date | null, ahora: Date): boolean {
  return Boolean(lastInboundAt) && ahora.getTime() - lastInboundAt!.getTime() < VENTANA_MS;
}

export function primerNombre(nombre: string | null | undefined): string {
  const n = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  // Los contactos del simulador se llaman "Cliente simulado 1a2b": no saludar asi.
  return /^cliente$/i.test(n) ? "" : n;
}

export function textoRecordatorio(nombre: string | null, cuando: string, servicio: string | null): string {
  const n = primerNombre(nombre);
  return `Hola${n ? ` ${n}` : ""}, te recuerdo tu turno${servicio ? ` de ${servicio.toLowerCase()}` : ""} ${cuando}. Me confirmás que venís?`;
}

export function textoVencida(etiqueta: string): string {
  return `Como no llegó la seña, liberé el horario del ${etiqueta}. Si querés, te busco otro horario que te quede cómodo.`;
}

export function textoConfirmada(etiqueta: string, servicio: string | null): string {
  return `Recibimos tu seña, tu turno${servicio ? ` de ${servicio.toLowerCase()}` : ""} quedó confirmado para el ${etiqueta}. Te esperamos.`;
}
