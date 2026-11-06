import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { cifrar, descifrar, estaCifrado, cifradoActivo, ultimos4, PREFIJO } from "@/lib/cifrado";
import { claveDesde, cifrarCon, descifrarCon } from "../scripts/lib/cifrado.mjs";
import { esquemaEnv } from "@/lib/env";

/**
 * Spec nucleo/12. El token de WhatsApp del cliente vive en la base: si se filtra un
 * backup, se filtra el numero. Lo que no puede volver a pasar sin avisar:
 *   - que se guarde un token en claro (cifrar sin clave tiene que FALLAR),
 *   - que un token cifrado se lea con otra clave y salga basura hacia Meta,
 *   - que la app y el runner de migraciones dejen de entenderse.
 */

const ORIGINAL = { ...process.env };
const CLAVE = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.ENCRYPTION_KEY = CLAVE;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("secretos cifrados en reposo", () => {
  it("cifra y descifra ida y vuelta, sin dejar el token a la vista", () => {
    const token = "EAAG-token-de-prueba-1234";
    const guardado = cifrar(token);
    expect(guardado.startsWith(PREFIJO)).toBe(true);
    expect(guardado).not.toContain(token);
    expect(estaCifrado(guardado)).toBe(true);
    expect(descifrar(guardado)).toBe(token);
  });

  it("cada cifrado usa un iv nuevo: el mismo token no da el mismo texto", () => {
    expect(cifrar("mismo")).not.toBe(cifrar("mismo"));
  });

  it("sin ENCRYPTION_KEY se niega a guardar: nunca en claro", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(cifradoActivo()).toBe(false);
    expect(() => cifrar("token")).toThrow(/ENCRYPTION_KEY/);
  });

  it("con otra clave falla con un error claro, no devuelve basura", () => {
    const guardado = cifrar("token");
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => descifrar(guardado)).toThrow(/no es la misma/);
  });

  it("un valor manipulado no pasa (GCM autentica)", () => {
    const guardado = cifrar("token");
    const partes = guardado.split(":");
    const datos = Buffer.from(partes[4], "base64");
    datos[0] ^= 0xff;
    partes[4] = datos.toString("base64");
    expect(() => descifrar(partes.join(":"))).toThrow();
  });

  it("el texto plano heredado se sigue leyendo (instancias viejas no se cortan)", () => {
    expect(descifrar("token-viejo-en-claro")).toBe("token-viejo-en-claro");
    expect(descifrar(null)).toBeNull();
  });

  it("app y runner de migraciones hablan el mismo formato", () => {
    const k = claveDesde(CLAVE);
    expect(descifrar(cifrarCon(k, "desde-el-runner"))).toBe("desde-el-runner");
    expect(descifrarCon(k, cifrar("desde-la-app"))).toBe("desde-la-app");
  });

  it("valida la clave: 32 bytes en base64, no hex ni texto", () => {
    expect(() => claveDesde("a".repeat(64))).toThrow(/32 bytes/);
    expect(() => claveDesde("corta")).toThrow();
    expect(claveDesde("")).toBeNull();
    const base = { DATABASE_URL: "x", NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x", AGENT_WORKER_SECRET: "x".repeat(32) };
    expect(esquemaEnv.safeParse({ ...base, ENCRYPTION_KEY: CLAVE }).success).toBe(true);
    expect(esquemaEnv.safeParse({ ...base, ENCRYPTION_KEY: "f".repeat(64) }).success).toBe(false);
    expect(esquemaEnv.safeParse(base).success).toBe(true);
  });

  it("para mostrar, solo los ultimos 4", () => {
    expect(ultimos4("EAAGabcd1234")).toBe("••••1234");
  });
});
