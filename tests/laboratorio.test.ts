import { describe, it, expect } from "vitest";
import { calcularPuntaje, interpretarVeredicto, veredictoSinRespuesta, armarPedidoJuez } from "@/lib/laboratorio/juez";
import { PERSONAS_NUCLEO } from "@/lib/laboratorio/personas";
import { agregarPreguntaAlPrompt, ENCABEZADO_CONOCIMIENTO } from "@/lib/laboratorio/motor";
import { esquemaConfig } from "@/lib/config/schema";
import { plantillaInmobiliaria } from "@config/plantillas/inmobiliaria";

/**
 * Spec nucleo/17. Lo que falla en silencio en el Laboratorio: un puntaje mal calculado
 * (se enciende un agente que no deberia), un veredicto que no se entiende (el caso se
 * pierde) o una sugerencia que pisa el prompt.
 */
describe("laboratorio: puntaje", () => {
  it("verde 1, amarillo 0,5, rojo 0, y lo no evaluado no cuenta", () => {
    expect(calcularPuntaje([{ veredicto: "verde" }, { veredicto: "verde" }])).toBe(100);
    expect(calcularPuntaje([{ veredicto: "verde" }, { veredicto: "amarillo" }])).toBe(75);
    expect(calcularPuntaje([{ veredicto: "verde" }, { veredicto: "rojo" }, { veredicto: null }])).toBe(50);
    expect(calcularPuntaje([{ veredicto: null }])).toBeNull();
  });
});

describe("laboratorio: veredicto del juez", () => {
  it("entiende JSON envuelto en texto o en ```json", () => {
    const v = interpretarVeredicto('Aca va:\n```json\n{"veredicto":"amarillo","resumen":"ok","hallazgos":[{"tipo":"tono","evidencia":"muy largo"}]}\n```');
    expect(v?.veredicto).toBe("amarillo");
    expect(v?.hallazgos[0].tipo).toBe("tono");
  });

  it("rechaza lo que no es un veredicto valido", () => {
    expect(interpretarVeredicto("no se")).toBeNull();
    expect(interpretarVeredicto('{"veredicto":"excelente"}')).toBeNull();
    expect(interpretarVeredicto(null)).toBeNull();
  });

  it("si el agente no contesto nada, es rojo sin gastar una llamada al juez", () => {
    expect(veredictoSinRespuesta([{ rol: "cliente", texto: "Hola, prueba" }])?.veredicto).toBe("rojo");
    expect(veredictoSinRespuesta([{ rol: "cliente", texto: "Hola" }, { rol: "agente", texto: "Hola!" }])).toBeNull();
  });

  it("el pedido al juez lleva la informacion del agente, lo esperado y la conversacion", () => {
    const pedido = armarPedidoJuez({
      conocimiento: "Horario: lunes a viernes 9 a 18",
      persona: PERSONAS_NUCLEO[0],
      transcripcion: [{ rol: "cliente", texto: "Hola, prueba" }, { rol: "agente", texto: "Hola! En que te ayudo?" }],
      estadoFinal: { etapa: "Nuevo" },
    });
    expect(pedido).toContain("Horario: lunes a viernes");
    expect(pedido).toContain(PERSONAS_NUCLEO[0].esperado!);
    expect(pedido).toContain("ASISTENTE: Hola! En que te ayudo?");
  });
});

describe("laboratorio: personas y configuracion", () => {
  it("las personas del nucleo y las de la plantilla inmobiliaria son validas", () => {
    const base = esquemaConfig.parse({ ...plantillaInmobiliaria, laboratorio: { personas: PERSONAS_NUCLEO } });
    expect(base.laboratorio.personas?.length).toBe(PERSONAS_NUCLEO.length);
    const inmo = esquemaConfig.parse(plantillaInmobiliaria);
    expect(inmo.laboratorio.personas?.length).toBeGreaterThanOrEqual(6);
    expect(new Set(PERSONAS_NUCLEO.map((p) => p.clave)).size).toBe(PERSONAS_NUCLEO.length);
  });

  it("por defecto no exige puntaje para encender (no traba instancias viejas)", () => {
    const { laboratorio, modulos } = esquemaConfig.parse({ ...plantillaInmobiliaria, laboratorio: undefined });
    expect(laboratorio.exigir).toBe(false);
    expect(laboratorio.puntajeMinimo).toBe(85);
    expect(modulos.nucleo.laboratorio).toBe(true);
  });
});

describe("laboratorio: sugerencias al prompt", () => {
  it("agrega un bloque de preguntas frecuentes sin tocar lo que ya habia", () => {
    const uno = agregarPreguntaAlPrompt("Sos Ana de Casa Sur.", "Aceptan mascotas?", "Si, en todas las propiedades de alquiler.");
    expect(uno.startsWith("Sos Ana de Casa Sur.")).toBe(true);
    expect(uno).toContain(ENCABEZADO_CONOCIMIENTO);
    const dos = agregarPreguntaAlPrompt(uno, "Abren sabados?", "De 10 a 13.");
    expect(dos.match(new RegExp(ENCABEZADO_CONOCIMIENTO.replace(/[()]/g, "\\$&"), "g"))?.length).toBe(1);
    expect(dos).toContain("Aceptan mascotas?");
    expect(dos).toContain("Abren sabados?");
  });
});

describe("laboratorio: umbral para encender el agente", () => {
  it("sin corrida o por debajo del minimo no deja encender; en el minimo si", async () => {
    const { decidirEncendido } = await import("@/lib/laboratorio/motor");
    expect(decidirEncendido(85, null).ok).toBe(false);
    expect(decidirEncendido(85, { puntaje: null }).ok).toBe(false);
    const bajo = decidirEncendido(85, { puntaje: 70 });
    expect(bajo.ok).toBe(false);
    expect(!bajo.ok && bajo.motivo).toMatch(/70\/100/);
    expect(decidirEncendido(85, { puntaje: 85 }).ok).toBe(true);
  });
});
