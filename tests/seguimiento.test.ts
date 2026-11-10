import { describe, it, expect } from "vitest";
import { decidirSeguimiento, medirSeguimientos, type EntradaDecision } from "@/lib/seguimiento/decidir";

/**
 * Spec nucleo/18. El seguimiento le escribe solo a clientes reales: lo que no puede
 * pasar es escribirle a quien ya respondio, de madrugada, fuera de la ventana sin
 * plantilla, o despues de que se cerro la venta.
 */
const BA = "America/Argentina/Buenos_Aires";
const h = (horas: number) => new Date(Date.UTC(2026, 10, 10, 13, 0) + horas * 3600_000); // 10:00 BA + horas

function base(over: Partial<EntradaDecision> = {}): EntradaDecision {
  return {
    ahora: h(4),
    zona: BA,
    config: {
      activo: true,
      pasos: [{ trasHoras: 3 }, { trasHoras: 22 }, { trasHoras: 48, plantilla: "retomar_consulta", idiomaPlantilla: "es_AR" }],
      horario: { desde: "09:00", hasta: "21:00" },
      etapasSinSeguimiento: ["llamada"],
    },
    conversacion: { channel: "whatsapp", lastInboundAt: h(0), needsHuman: false, aiEnabled: true },
    contacto: { aiEnabled: true, tags: [] },
    etapa: { clave: "interesado", ganada: false, perdida: false },
    mensajes: [
      { direction: "in", createdAt: h(0), rawPayload: null },
      { direction: "out", createdAt: h(0.01), rawPayload: null },
    ],
    ...over,
  };
}
const seg = (horas: number, paso: number) => ({ direction: "out", createdAt: h(horas), rawPayload: { seguimiento: { paso } } });

describe("seguimiento: cuando escribir", () => {
  it("a las 3 h del ultimo mensaje del cliente, primer seguimiento, texto libre", () => {
    expect(decidirSeguimiento(base())).toEqual({ enviar: true, paso: 1, total: 3, modo: "texto" });
  });

  it("antes del plazo, no", () => {
    expect(decidirSeguimiento(base({ ahora: h(2) }))).toMatchObject({ enviar: false, motivo: "todavia no" });
  });

  it("si el cliente escribio ultimo, no es seguimiento (le toca al agente)", () => {
    const d = decidirSeguimiento(base({ mensajes: [{ direction: "out", createdAt: h(-1), rawPayload: null }, { direction: "in", createdAt: h(0), rawPayload: null }] }));
    expect(d).toMatchObject({ enviar: false, motivo: "el cliente escribio ultimo" });
  });

  it("cuenta los seguimientos ya enviados y pasa al siguiente", () => {
    const d = decidirSeguimiento(base({ ahora: h(23), mensajes: [...base().mensajes, seg(3, 1)] }));
    expect(d).toMatchObject({ enviar: true, paso: 2, modo: "texto" });
  });

  it("si el cliente respondio a un seguimiento, la cuenta vuelve a empezar", () => {
    const d = decidirSeguimiento(
      base({
        ahora: h(30),
        conversacion: { channel: "whatsapp", lastInboundAt: h(26), needsHuman: false, aiEnabled: true },
        mensajes: [...base().mensajes, seg(3, 1), { direction: "in", createdAt: h(26), rawPayload: null }, { direction: "out", createdAt: h(26.01), rawPayload: null }],
      })
    );
    expect(d).toMatchObject({ enviar: true, paso: 1 });
  });

  it("agotados los pasos, no escribe mas", () => {
    const d = decidirSeguimiento(base({ ahora: h(100), mensajes: [...base().mensajes, seg(3, 1), seg(22, 2), seg(48, 3)] }));
    expect(d).toMatchObject({ enviar: false, motivo: "seguimientos agotados" });
  });
});

describe("seguimiento: ventana de 24 h", () => {
  it("fuera de las 24 h en WhatsApp usa la plantilla del paso", () => {
    const d = decidirSeguimiento(base({ ahora: h(49), mensajes: [...base().mensajes, seg(3, 1), seg(22, 2)] }));
    expect(d).toEqual({ enviar: true, paso: 3, total: 3, modo: "plantilla", plantilla: "retomar_consulta", idioma: "es_AR" });
  });
  it("fuera de las 24 h sin plantilla, no manda nada", () => {
    const config = { ...base().config, pasos: [{ trasHoras: 30 }] };
    expect(decidirSeguimiento(base({ ahora: h(31), config }))).toMatchObject({ enviar: false });
  });
  it("Instagram fuera de las 24 h nunca", () => {
    const d = decidirSeguimiento(
      base({ ahora: h(49), conversacion: { channel: "instagram", lastInboundAt: h(0), needsHuman: false, aiEnabled: true }, mensajes: [...base().mensajes, seg(3, 1), seg(22, 2)] })
    );
    expect(d).toMatchObject({ enviar: false });
  });
});

describe("seguimiento: cuando NO escribir", () => {
  it("de madrugada no (zona del negocio)", () => {
    // 3 h despues de un mensaje de las 23:00 BA son las 02:00
    const d = decidirSeguimiento(
      base({ ahora: h(16), conversacion: { channel: "whatsapp", lastInboundAt: h(13), needsHuman: false, aiEnabled: true }, mensajes: [{ direction: "in", createdAt: h(13), rawPayload: null }, { direction: "out", createdAt: h(13.01), rawPayload: null }] })
    );
    expect(d).toMatchObject({ enviar: false, motivo: "fuera de horario" });
  });
  it("derivada a una persona, agente pausado, etapa cerrada o sin seguimiento: no", () => {
    expect(decidirSeguimiento(base({ conversacion: { ...base().conversacion, needsHuman: true } })).enviar).toBe(false);
    expect(decidirSeguimiento(base({ contacto: { aiEnabled: false, tags: [] } })).enviar).toBe(false);
    expect(decidirSeguimiento(base({ etapa: { clave: "cliente", ganada: true, perdida: false } })).enviar).toBe(false);
    expect(decidirSeguimiento(base({ etapa: { clave: "llamada", ganada: false, perdida: false } })).enviar).toBe(false);
    expect(decidirSeguimiento(base({ contacto: { aiEnabled: true, tags: ["laboratorio"] } })).enviar).toBe(false);
  });
  it("apagado, no", () => {
    expect(decidirSeguimiento(base({ config: { ...base().config, activo: false } })).enviar).toBe(false);
  });
  it("el boton de prueba ignora la espera y el horario", () => {
    expect(decidirSeguimiento(base({ ahora: h(0.5), ignorarEspera: true }))).toMatchObject({ enviar: true, paso: 1 });
  });
});

describe("seguimiento: medicion para el retorno", () => {
  it("una conversacion se recupera si el cliente vuelve a escribir despues del seguimiento", () => {
    const m = medirSeguimientos([
      { conversationId: "a", direction: "in", createdAt: h(0), rawPayload: null },
      { conversationId: "a", direction: "out", createdAt: h(3), rawPayload: { seguimiento: { paso: 1 } } },
      { conversationId: "a", direction: "in", createdAt: h(4), rawPayload: null },
      { conversationId: "b", direction: "in", createdAt: h(0), rawPayload: null },
      { conversationId: "b", direction: "out", createdAt: h(3), rawPayload: { seguimiento: { paso: 1 } } },
      { conversationId: "b", direction: "out", createdAt: h(22), rawPayload: { seguimiento: { paso: 2 } } },
      { conversationId: "c", direction: "in", createdAt: h(0), rawPayload: null },
    ]);
    expect(m).toEqual({ enviados: 3, conversacionesConSeguimiento: 2, recuperadas: 1 });
  });
});
