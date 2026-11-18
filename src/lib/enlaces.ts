/**
 * Links con texto en los mensajes (spec nucleo/20). PURO: lo usan el agente, el envio y
 * la bandeja.
 *
 * Un mensaje puede llevar `[Paga tu sena aca](https://...)`. La bandeja y el simulador lo
 * muestran como un link corto y clickeable; a un canal real (WhatsApp, Instagram,
 * Messenger), que no entiende ese formato, le llega como "Paga tu sena aca: https://...".
 */

export interface Enlace {
  url: string;
  texto: string;
}

export type Tramo = { tipo: "texto"; valor: string } | { tipo: "link"; texto: string; url: string };

const MARKDOWN = /\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]+)\)/g;
const URL_SUELTA = /https?:\/\/[^\s)<>"]+/g;

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reemplaza cada URL conocida que el modelo escribio suelta por su version con texto.
 * La que ya viene como `[texto](url)` no se toca. Un signo de puntuacion pegado al final
 * (". , ;") se respeta: el modelo suele cerrar la oracion pegado al link.
 */
export function aplicarEnlaces(texto: string, enlaces: Enlace[]): string {
  let salida = texto;
  for (const e of enlaces) {
    if (!e.url || !e.texto) continue;
    const suelta = new RegExp(`(?<!\\]\\()${escaparRegex(e.url)}(?![\\w/?#&=%-])`, "g");
    salida = salida.replace(suelta, `[${e.texto}](${e.url})`);
  }
  return salida;
}

/** Para un canal real: `[texto](url)` -> `texto: url`. */
export function enlacesComoTexto(texto: string): string {
  return texto.replace(MARKDOWN, (_m, t: string, u: string) => `${t}: ${u}`);
}

/** URL acortada para mostrar: dominio y el comienzo de la ruta. */
export function urlCorta(url: string): string {
  try {
    const u = new URL(url);
    const ruta = u.pathname === "/" ? "" : u.pathname;
    const corta = `${u.host}${ruta}`;
    return corta.length > 40 ? `${corta.slice(0, 38)}…` : corta;
  } catch {
    return url.length > 40 ? `${url.slice(0, 38)}…` : url;
  }
}

/** Parte el texto en tramos de texto y links (markdown o URL suelta). */
export function partirEnlaces(texto: string): Tramo[] {
  const tramos: Tramo[] = [];
  const empujarTexto = (valor: string) => {
    if (!valor) return;
    let ultimo = 0;
    for (const m of valor.matchAll(URL_SUELTA)) {
      let url = m[0];
      // Puntuacion de cierre de la oracion, no de la URL.
      const cola = url.match(/[.,;:!?]+$/)?.[0] ?? "";
      if (cola) url = url.slice(0, -cola.length);
      const i = m.index ?? 0;
      if (i > ultimo) tramos.push({ tipo: "texto", valor: valor.slice(ultimo, i) });
      tramos.push({ tipo: "link", texto: urlCorta(url), url });
      ultimo = i + url.length;
    }
    if (ultimo < valor.length) tramos.push({ tipo: "texto", valor: valor.slice(ultimo) });
  };

  let ultimo = 0;
  for (const m of texto.matchAll(MARKDOWN)) {
    const i = m.index ?? 0;
    empujarTexto(texto.slice(ultimo, i));
    tramos.push({ tipo: "link", texto: m[1], url: m[2] });
    ultimo = i + m[0].length;
  }
  empujarTexto(texto.slice(ultimo));
  return tramos;
}
