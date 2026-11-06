import { describe, it, expect } from "vitest";
import { armarHistorial, ultimoEntrante, type FilaHistorial } from "@/lib/agent/historial";
import { REGLAS_NUCLEO, renderSystemPrompt } from "@/lib/agent/prompt";

/**
 * Specs nucleo/14 y 15. Las dos formas en que un cliente se queda sin respuesta sin que
 * nadie lo vea: el agente decide callar, o da por contestado un mensaje que no leyo.
 */

const t = (s: number) => new Date(Date.UTC(2026, 10, 6, 15, 0, s));

function entra(s: number, body: string): FilaHistorial {
  return { direction: "in", body, origin: null, createdAt: t(s), rawPayload: null };
}
function agente(s: number, body: string, leidoHasta: number | null): FilaHistorial {
  return {
    direction: "out",
    body,
    origin: "agent",
    createdAt: t(s),
    rawPayload: leidoHasta === null ? null : { agente: { leidoHasta: t(leidoHasta).toISOString() } },
  };
}
function persona(s: number, body: string): FilaHistorial {
  return { direction: "out", body, origin: "human", createdAt: t(s), rawPayload: null };
}

describe("sin responder no es sin entregar (spec 14)", () => {
  it("el cliente escribe mientras el agente piensa: el segundo mensaje queda debido", () => {
    // 0 s "hola" -> el agente lee hasta 0 s, tarda y guarda la respuesta a los 25 s.
    // 10 s "¿hacen envios?" llega en el medio.
    const filas = [entra(0, "hola"), entra(10, "¿hacen envios?"), agente(25, "¡Hola! ¿En que te ayudo?", 0)];
    const h = armarHistorial(filas);
    expect(h).not.toBe("already_replied");
    expect(Array.isArray(h) && h[h.length - 1]).toEqual({ role: "user", content: "¿hacen envios?" });
  });

  it("si el agente leyo los dos, el hilo esta contestado", () => {
    const filas = [entra(0, "hola"), entra(3, "¿hacen envios?"), agente(25, "Si, hacemos envios", 3)];
    expect(armarHistorial(filas)).toBe("already_replied");
  });

  it("una respuesta de una persona salda todo lo anterior", () => {
    const filas = [entra(0, "hola"), entra(10, "¿hacen envios?"), persona(25, "Si, a todo el pais")];
    expect(armarHistorial(filas)).toBe("already_replied");
  });

  it("filas viejas sin anotacion se comportan como antes", () => {
    expect(armarHistorial([entra(0, "hola"), agente(5, "Hola!", null)])).toBe("already_replied");
    expect(armarHistorial([agente(0, "Hola!", null), entra(5, "precio?")])).toEqual([
      { role: "user", content: "precio?" },
    ]);
    expect(armarHistorial([])).toBe("empty");
  });

  it("anota como leido el entrante mas nuevo", () => {
    expect(ultimoEntrante([entra(0, "a"), agente(2, "b", 0), entra(9, "c")])?.toISOString()).toBe(t(9).toISOString());
  });
});

describe("el agente no se queda callado (spec 15)", () => {
  it("las reglas del nucleo van aunque el cliente reemplace el prompt entero", () => {
    const prompt = renderSystemPrompt("Sos Ana de Inmobiliaria Sur. Solo hablas de propiedades.");
    expect(prompt).toContain(REGLAS_NUCLEO);
    expect(prompt).toMatch(/Siempre respondes algo/);
    expect(prompt).toMatch(/UN solo mensaje/);
  });
});
