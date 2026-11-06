/**
 * Historial que ve el agente (spec nucleo/14-sin-responder-no-es-sin-entregar).
 *
 * El problema: el cliente escribe "hola" y el agente tarda 20 s en contestar. En ese
 * rato el cliente manda "¿y hacen envios?". La respuesta al primero se guarda DESPUES
 * del segundo, asi que ordenando por hora de guardado el hilo termina en un saliente y
 * el job del segundo mensaje concluia "ya contestado" (`already_replied`): nadie le
 * respondia hasta que el cliente volviera a escribir. En Vocero CRM midieron ese caso
 * en el 1,7 % de los turnos.
 *
 * La regla: una respuesta del AGENTE solo salda los entrantes que el agente leyo. Por
 * eso se ordena por el momento que respondio (`leidoHasta`, guardado al enviar) y no
 * por cuando se guardo. Una respuesta de una PERSONA salda todo lo anterior (la
 * persona ve el hilo completo). Pura: sin base, para poder probarla.
 */

export interface FilaHistorial {
  direction: string;
  body: string | null;
  origin: string | null;
  createdAt: Date;
  rawPayload: unknown;
}

export type TurnoHistorial = { role: "user" | "assistant"; content: string };
export type Historial = TurnoHistorial[] | "empty" | "no_user" | "already_replied";

/** Hasta que entrante leyo el agente cuando armo este saliente (si lo dejo anotado). */
export function leidoHasta(fila: FilaHistorial): Date | null {
  if (fila.direction !== "out" || fila.origin !== "agent") return null;
  const raw = fila.rawPayload as { agente?: { leidoHasta?: unknown } } | null;
  const valor = raw?.agente?.leidoHasta;
  if (typeof valor !== "string") return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Momento en que la fila "cuenta" en el hilo. */
function momento(fila: FilaHistorial): number {
  const leido = leidoHasta(fila);
  // +1 ms: la respuesta va justo despues del ultimo entrante que leyo, y antes de
  // cualquiera que haya llegado mientras pensaba.
  if (leido && leido.getTime() < fila.createdAt.getTime()) return leido.getTime() + 1;
  return fila.createdAt.getTime();
}

/** Ordena (cronologico) y colapsa turnos seguidos del mismo rol. */
export function armarHistorial(filas: FilaHistorial[]): Historial {
  if (filas.length === 0) return "empty";

  const ordenadas = filas
    .map((f, i) => ({ f, i, t: momento(f) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.f);

  const turnos: TurnoHistorial[] = [];
  for (const m of ordenadas) {
    const role: "user" | "assistant" = m.direction === "in" ? "user" : "assistant";
    const text = m.body?.trim();
    if (!text) continue;
    const ultimo = turnos[turnos.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content = `${ultimo.content}\n${text}`;
    else turnos.push({ role, content: text });
  }

  while (turnos.length > 0 && turnos[0].role === "assistant") turnos.shift();
  if (turnos.length === 0) return "no_user";
  if (turnos[turnos.length - 1].role !== "user") return "already_replied";
  return turnos;
}

/** El entrante mas nuevo de las filas (lo que el agente "leyo" en este turno). */
export function ultimoEntrante(filas: FilaHistorial[]): Date | null {
  let max: Date | null = null;
  for (const f of filas) {
    if (f.direction === "in" && (!max || f.createdAt > max)) max = f.createdAt;
  }
  return max;
}
