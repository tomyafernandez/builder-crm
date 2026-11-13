import "server-only";
import { modulosActivos } from "./index";
import type { OpcionesBarrido, ResultadoBarrido } from "./types";

/**
 * Corre el `barrido` de cada modulo activo (spec nucleo/19). Un modulo inactivo no esta
 * en el registro, asi que no corre. Si uno falla, los demas siguen: un recordatorio no
 * puede quedar trabado por el error de otro modulo.
 */
export async function correrBarridosDeModulos(opciones: OpcionesBarrido = {}): Promise<Record<string, ResultadoBarrido | { error: string }>> {
  const salida: Record<string, ResultadoBarrido | { error: string }> = {};
  for (const m of modulosActivos()) {
    if (!m.barrido) continue;
    try {
      salida[m.manifiesto.nombre] = await m.barrido(normalizar(opciones));
    } catch (err) {
      console.error(`[barridos] modulo ${m.manifiesto.nombre} fallo:`, err instanceof Error ? err.message : err);
      salida[m.manifiesto.nombre] = { error: err instanceof Error ? err.message : "error" };
    }
  }
  return salida;
}

/** `ignorarEspera` solo vale junto con `soloSimulador`: nunca con clientes reales. */
export function normalizar(o: OpcionesBarrido): OpcionesBarrido {
  const soloSimulador = Boolean(o.soloSimulador);
  return { soloSimulador, ignorarEspera: soloSimulador && Boolean(o.ignorarEspera) };
}
