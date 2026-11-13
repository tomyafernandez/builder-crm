import type { MetricaRetorno } from "@/lib/modules/types";

/**
 * Tarjeta "Lo que te dejo el sistema" (spec nucleo/19). PURO: sin base ni red. El lado
 * servidor (`retorno-servidor.ts`) junta los conteos y las lineas de los modulos.
 */

export type Formatear = (centavos: number) => string;

/** Horas que le llevaria a una persona escribir lo que escribio el agente. */
export function lineaHorasAhorradas(mensajesAgente: number, minutosPorMensaje: number): MetricaRetorno {
  const horas = (mensajesAgente * minutosPorMensaje) / 60;
  const redondeo = horas >= 10 ? Math.round(horas) : Math.round(horas * 10) / 10;
  return {
    clave: "horas_ahorradas",
    etiqueta: "Horas ahorradas",
    montoCentavos: null,
    valorTexto: `${redondeo.toLocaleString("es-AR")} h`,
    cuenta: `${mensajesAgente.toLocaleString("es-AR")} mensajes del agente x ${minutosPorMensaje} min`,
    estimado: true,
    sumaAlTotal: false,
  };
}

/** Suma de las lineas que suman (las que son plata y no estan marcadas `sumaAlTotal: false`). */
export function totalRetorno(lineas: MetricaRetorno[]): number {
  return lineas.reduce((t, l) => (l.montoCentavos !== null && l.sumaAlTotal !== false ? t + l.montoCentavos : t), 0);
}

export interface Retorno {
  dias: number;
  lineas: MetricaRetorno[];
  totalCentavos: number;
  /** true si alguna linea que suma es estimada. */
  totalEstimado: boolean;
}

export function armarRetorno(input: {
  dias: number;
  mensajesAgente: number;
  minutosPorMensaje: number;
  /** Conversaciones recuperadas por el seguimiento (para la linea sin precio). */
  recuperadas?: number;
  lineasModulos: MetricaRetorno[];
}): Retorno {
  const lineas = [lineaHorasAhorradas(input.mensajesAgente, input.minutosPorMensaje)];
  // Sin un modulo que le ponga precio (agenda), el recupero se muestra como cantidad.
  if (!input.lineasModulos.some((l) => l.clave === "recuperado_seguimiento") && input.recuperadas !== undefined) {
    lineas.push({
      clave: "recuperado_seguimiento",
      etiqueta: "Recuperadas por seguimiento",
      montoCentavos: null,
      valorTexto: String(input.recuperadas),
      cuenta: "conversaciones que volvieron a escribir despues de un seguimiento",
      sumaAlTotal: false,
    });
  }
  lineas.push(...input.lineasModulos);
  const suman = lineas.filter((l) => l.montoCentavos !== null && l.sumaAlTotal !== false);
  return {
    dias: input.dias,
    lineas,
    totalCentavos: totalRetorno(lineas),
    totalEstimado: suman.some((l) => l.estimado),
  };
}

/**
 * Cuenta "N x precio": si todos los precios son iguales muestra el precio; si no, el
 * promedio redondeado. Para que la cuenta se pueda seguir con la vista.
 */
export function cuentaPorPrecio(cantidad: number, precios: number[], unidad: string, fmt: Formatear, factor?: { texto: string }): string {
  const base = `${cantidad} ${unidad}`;
  if (cantidad === 0) return base;
  const iguales = precios.every((p) => p === precios[0]);
  const precio = iguales ? fmt(precios[0]) : `${fmt(Math.round(precios.reduce((a, b) => a + b, 0) / precios.length))} promedio`;
  return factor ? `${base} x ${factor.texto} x ${precio}` : `${base} x ${precio}`;
}
