import { describe, it, expect } from "vitest";
import { destinoPermitido, parsearPermitidos } from "@/lib/permitidos";

/**
 * Spec nucleo/13. Con ALLOWED_WA_IDS cargada se prueba con el numero REAL de un
 * cliente: si el filtro falla, el agente le escribe a SUS clientes. Falla en silencio,
 * por eso esta aca.
 */
describe("numeros permitidos (modo pruebas en vivo)", () => {
  it("vacia: no restringe nada (produccion)", () => {
    const lista = parsearPermitidos("");
    expect(lista.activa).toBe(false);
    expect(destinoPermitido(lista, "whatsapp", "+5491112345678")).toBe(true);
    expect(destinoPermitido(parsearPermitidos(undefined), "instagram", "123")).toBe(true);
  });

  it("con valor: solo esos numeros, normalizados como el resto del CRM", () => {
    const lista = parsearPermitidos(" +54 9 11 1234-5678 , 5491187654321");
    expect(lista.activa).toBe(true);
    expect(destinoPermitido(lista, "whatsapp", "+5491112345678")).toBe(true);
    // 54 + 10 digitos (sin el 9) es el mismo movil
    expect(destinoPermitido(lista, "whatsapp", "541112345678")).toBe(true);
    expect(destinoPermitido(lista, "whatsapp", "5491187654321")).toBe(true);
    expect(destinoPermitido(lista, "whatsapp", "+5491199999999")).toBe(false);
  });

  it("con valor y sin destino conocido: no sale", () => {
    const lista = parsearPermitidos("5491112345678");
    expect(destinoPermitido(lista, "whatsapp", null)).toBe(false);
    expect(destinoPermitido(lista, "whatsapp", "")).toBe(false);
  });

  it("Instagram y Messenger por id con prefijo; una lista de telefonos no los habilita", () => {
    const lista = parsearPermitidos("5491112345678, ig:17841400000, fb:2600000");
    expect(destinoPermitido(lista, "instagram", "17841400000")).toBe(true);
    expect(destinoPermitido(lista, "instagram", "99999")).toBe(false);
    expect(destinoPermitido(lista, "facebook", "2600000")).toBe(true);
    expect(destinoPermitido(lista, "messenger", "2600000")).toBe(true);
    expect(destinoPermitido(parsearPermitidos("5491112345678"), "instagram", "5491112345678")).toBe(false);
  });
});
