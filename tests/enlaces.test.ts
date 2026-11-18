import { describe, it, expect } from "vitest";
import { aplicarEnlaces, enlacesComoTexto, partirEnlaces } from "@/lib/enlaces";

/**
 * Spec nucleo/20. El link de pago tiene que verse corto y clickeable en la bandeja, y a un
 * canal real (que no entiende markdown) tiene que llegarle la URL entera.
 */
const URL = "https://demo.app/m/agenda/publico/pago/0adb8d30-a3ce-49f9-8fac-53dde6402c07";

describe("aplicarEnlaces", () => {
  it("cambia la URL suelta por el link con texto, respetando el punto final", () => {
    const r = aplicarEnlaces(`Te dejo el link para pagar la seña: ${URL}. Tenés 1 hora.`, [{ url: URL, texto: "Pagá tu seña acá" }]);
    expect(r).toBe(`Te dejo el link para pagar la seña: [Pagá tu seña acá](${URL}). Tenés 1 hora.`);
  });

  it("no toca un link que ya viene con texto ni una URL desconocida", () => {
    const ya = `[Pagá tu seña acá](${URL})`;
    expect(aplicarEnlaces(ya, [{ url: URL, texto: "Pagá tu seña acá" }])).toBe(ya);
    expect(aplicarEnlaces("Mirá https://otra.com", [{ url: URL, texto: "x" }])).toBe("Mirá https://otra.com");
  });
});

describe("enlacesComoTexto", () => {
  it("a un canal real le llega texto y URL", () => {
    expect(enlacesComoTexto(`Listo: [Pagá tu seña acá](${URL}).`)).toBe(`Listo: Pagá tu seña acá: ${URL}.`);
  });
});

describe("partirEnlaces", () => {
  it("separa texto, link con texto y URL suelta acortada", () => {
    const t = partirEnlaces(`Pagá acá: [Pagá tu seña acá](${URL}). O entrá a https://estudionorte.com.ar/turnos.`);
    expect(t).toEqual([
      { tipo: "texto", valor: "Pagá acá: " },
      { tipo: "link", texto: "Pagá tu seña acá", url: URL },
      { tipo: "texto", valor: ". O entrá a " },
      { tipo: "link", texto: "estudionorte.com.ar/turnos", url: "https://estudionorte.com.ar/turnos" },
      { tipo: "texto", valor: "." },
    ]);
  });
});
