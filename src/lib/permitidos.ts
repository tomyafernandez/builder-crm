/**
 * Guardarrail de pruebas en vivo (spec nucleo/13-numeros-permitidos).
 *
 * Con `ALLOWED_WA_IDS` cargada, NADA sale hacia una identidad fuera de la lista: ni el
 * agente, ni una persona desde la bandeja, ni una plantilla, ni una automatizacion, ni
 * un reintento. Se chequea en las dos unicas puertas de salida (`deliverMessage` y el
 * primer contacto por plantilla de `/api/whatsapp/send`), asi que ningun camino nuevo
 * puede saltearlo sin pasar por ahi.
 *
 * Sirve para probar con el numero REAL de un cliente sin riesgo de escribirle a sus
 * clientes. Vacia = sin restriccion (produccion). La conversacion del simulador nunca
 * sale a la red y no se filtra.
 *
 * Formato: numeros con o sin "+", espacios o guiones, separados por coma (se normalizan
 * igual que el resto del CRM: 54 + 10 digitos -> 549...). Para Instagram, Messenger o
 * TikTok, el id del participante con prefijo: ig:123, fb:456, tt:789.
 */
import { normalizePhone } from "@/lib/phone";

const PREFIJO_CANAL: Record<string, string> = {
  instagram: "ig",
  messenger: "fb",
  facebook: "fb",
  tiktok: "tt",
};

export interface ListaPermitidos {
  activa: boolean;
  telefonos: Set<string>;
  otros: Set<string>;
}

export function parsearPermitidos(valor: string | null | undefined): ListaPermitidos {
  const telefonos = new Set<string>();
  const otros = new Set<string>();
  for (const crudo of (valor ?? "").split(",")) {
    const item = crudo.trim();
    if (!item) continue;
    if (/^[a-z]{2}:/i.test(item)) {
      otros.add(item.toLowerCase());
      continue;
    }
    const tel = normalizePhone(item);
    if (tel) telefonos.add(tel);
  }
  return { activa: telefonos.size + otros.size > 0, telefonos, otros };
}

/** true si se le puede escribir a ese participante. Pura: recibe la lista ya parseada. */
export function destinoPermitido(
  lista: ListaPermitidos,
  channel: string,
  participantId: string | null | undefined
): boolean {
  if (!lista.activa) return true;
  if (!participantId) return false;
  if (channel === "whatsapp") {
    return lista.telefonos.has(normalizePhone(participantId));
  }
  const prefijo = PREFIJO_CANAL[channel] ?? channel.slice(0, 2);
  return lista.otros.has(`${prefijo}:${participantId}`.toLowerCase());
}

/** Lista del entorno (se lee en cada llamada: cambiarla no exige redeploy en dev). */
export function permitidosDelEntorno(): ListaPermitidos {
  return parsearPermitidos(process.env.ALLOWED_WA_IDS);
}

export const ERROR_FUERA_DE_LISTA = "fuera_de_lista_permitida";

export function motivoFueraDeLista(): string {
  return "Modo pruebas: ALLOWED_WA_IDS esta cargada y este destino no esta en la lista. No se envio nada.";
}
