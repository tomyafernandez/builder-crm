/**
 * Cifrado en reposo de secretos guardados en la base (spec nucleo/12-secretos-cifrados).
 * La implementacion vive en `scripts/lib/cifrado.mjs` para que la usen tambien el
 * runner de migraciones y los scripts; aca solo se le da tipo y se lee la clave del
 * entorno.
 */
import {
  claveDesde,
  cifrarCon,
  descifrarCon,
  estaCifrado as estaCifradoImpl,
  ultimos4 as ultimos4Impl,
  PREFIJO as PREFIJO_IMPL,
} from "../../scripts/lib/cifrado.mjs";

export const PREFIJO: string = PREFIJO_IMPL;

function clave(): Buffer | null {
  return claveDesde(process.env.ENCRYPTION_KEY) as Buffer | null;
}

/** true si hay clave valida configurada. */
export function cifradoActivo(): boolean {
  try {
    return clave() !== null;
  } catch {
    return false;
  }
}

export function estaCifrado(valor: unknown): boolean {
  return estaCifradoImpl(valor) as boolean;
}

/** Cifra un secreto para guardarlo. Sin ENCRYPTION_KEY lanza: nunca se guarda en claro. */
export function cifrar(texto: string): string {
  const k = clave();
  if (!k) throw new Error("Falta ENCRYPTION_KEY: no se guardan secretos en texto plano (openssl rand -base64 32)");
  return cifrarCon(k, texto) as string;
}

let avisoPlano = false;

/** Descifra un secreto leido de la base. El texto plano heredado sale tal cual (con aviso). */
export function descifrar(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  if (!estaCifrado(valor) && !avisoPlano) {
    avisoPlano = true;
    console.warn("[cifrado] hay un secreto en texto plano en la base: configura ENCRYPTION_KEY y redespliega para cifrarlo");
  }
  return descifrarCon(clave(), valor) as string | null;
}

export function ultimos4(valor: string | null | undefined): string {
  return ultimos4Impl(valor) as string;
}
