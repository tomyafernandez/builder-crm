// Cifrado en reposo de secretos guardados en la base (spec nucleo/12).
//
// Una sola implementacion para la app (src/lib/cifrado.ts la reexporta) y para los
// scripts que corren sin Next: el runner de migraciones (que cifra lo que haya quedado
// en claro) y connect:whatsapp. Si hubiera dos copias, un dia dejarian de entenderse y
// el sintoma seria un token que "no anda" sin ningun error claro.
//
// Formato del valor guardado:  enc:v1:<iv base64>:<tag base64>:<cifrado base64>
// AES-256-GCM, iv aleatorio de 12 bytes por valor. La clave es ENCRYPTION_KEY:
// exactamente 32 bytes en base64 (44 caracteres). Generar con: openssl rand -base64 32
//
// Un valor sin el prefijo es texto plano heredado (instancias anteriores a 2.2.0): se
// sigue leyendo para no cortar a nadie, y el runner de migraciones lo cifra al arrancar.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const PREFIJO = "enc:v1:";

/** Valida y decodifica la clave. Devuelve null si falta; lanza si es invalida. */
export function claveDesde(texto) {
  if (texto === undefined || texto === null || String(texto).trim() === "") return null;
  const limpio = String(texto).trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(limpio)) {
    throw new Error("ENCRYPTION_KEY invalida: deben ser 32 bytes en base64 (44 caracteres). Generar con: openssl rand -base64 32");
  }
  const clave = Buffer.from(limpio, "base64");
  if (clave.length !== 32) {
    throw new Error("ENCRYPTION_KEY invalida: deben ser 32 bytes en base64 (44 caracteres)");
  }
  return clave;
}

export function estaCifrado(valor) {
  return typeof valor === "string" && valor.startsWith(PREFIJO);
}

/** Cifra un texto con la clave (Buffer de 32 bytes). */
export function cifrarCon(clave, texto) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clave, iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIJO}${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
}

/**
 * Descifra un valor guardado. Texto plano heredado sale tal cual. Si el valor esta
 * cifrado y la clave falta o no coincide, lanza: es preferible un error claro a mandar
 * basura como token a Meta.
 */
export function descifrarCon(clave, valor) {
  if (valor === null || valor === undefined) return null;
  if (!estaCifrado(valor)) return valor;
  if (!clave) throw new Error("Hay secretos cifrados en la base pero falta ENCRYPTION_KEY");
  const partes = valor.slice(PREFIJO.length).split(":");
  if (partes.length !== 3) throw new Error("Secreto cifrado con formato invalido");
  const [iv, tag, datos] = partes.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", clave, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(datos), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar un secreto: ENCRYPTION_KEY no es la misma con la que se cifro");
  }
}

/** Ultimos 4 caracteres, para mostrar sin exponer. */
export function ultimos4(valor) {
  if (!valor) return "";
  return `••••${String(valor).slice(-4)}`;
}
