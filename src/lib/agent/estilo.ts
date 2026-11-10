/**
 * Retoques de estilo sobre lo que escribe el agente, ANTES de enviarlo. Puro.
 *
 * Hay reglas de estilo que el prompt pide y el modelo igual se saltea de vez en cuando
 * (en un chat de WhatsApp casi nadie escribe "¿" ni "¡", y verlos delata que escribe
 * una maquina). Lo que se puede garantizar con codigo no se deja librado al modelo.
 */
export interface OpcionesEstilo {
  /** Saca los signos de apertura ¿ y ¡ (config.agente.sinSignosApertura). */
  sinSignosApertura?: boolean;
}

export function pulirTexto(texto: string, opciones: OpcionesEstilo): string {
  let t = texto;
  if (opciones.sinSignosApertura) {
    t = t.replace(/[¿¡]\s*/g, "");
  }
  return t;
}
