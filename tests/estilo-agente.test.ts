import { describe, it, expect } from "vitest";
import { pulirTexto } from "@/lib/agent/estilo";

describe("estilo del agente", () => {
  it("saca los signos de apertura si la config lo pide", () => {
    expect(pulirTexto("Hola, ¿cómo están? ¡Genial!", { sinSignosApertura: true })).toBe("Hola, cómo están? Genial!");
    expect(pulirTexto("¿ Te sirve?", { sinSignosApertura: true })).toBe("Te sirve?");
  });
  it("si no, deja el texto como esta", () => {
    expect(pulirTexto("¿Cómo están?", {})).toBe("¿Cómo están?");
  });
});
