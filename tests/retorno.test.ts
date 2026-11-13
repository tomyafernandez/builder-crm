import { describe, it, expect } from "vitest";
import { armarRetorno, cuentaPorPrecio, lineaHorasAhorradas, totalRetorno } from "@/lib/retorno";
import { conversacionesRecuperadas } from "@/lib/seguimiento/decidir";
import { esRutaPublicaDeModulo } from "@/lib/supabase/middleware";
import type { MetricaRetorno } from "@/lib/modules/types";

/**
 * Tarjeta "Lo que te dejo el sistema" (spec nucleo/19). Lo que falla en silencio: un total
 * que cuenta dos veces la misma plata, o una cuenta que no se puede rehacer a mano.
 */
const fmt = (c: number) => `USD ${Math.round(c / 100)}`;

describe("retorno: horas ahorradas", () => {
  it("mensajes x minutos / 60, estimado y fuera del total en plata", () => {
    const l = lineaHorasAhorradas(7200, 3);
    expect(l.valorTexto).toBe("360 h");
    expect(l.montoCentavos).toBeNull();
    expect(l.estimado).toBe(true);
    expect(l.cuenta).toContain("x 3 min");
  });
  it("menos de 10 horas con un decimal", () => {
    expect(lineaHorasAhorradas(50, 3).valorTexto).toBe("2,5 h");
  });
});

describe("retorno: total", () => {
  const lineas: MetricaRetorno[] = [
    { clave: "recuperado_seguimiento", etiqueta: "", montoCentavos: 160000, cuenta: "" },
    { clave: "ausencias_evitadas", etiqueta: "", montoCentavos: 66000, cuenta: "", estimado: true },
    { clave: "senas_cobradas", etiqueta: "", montoCentavos: 230000, cuenta: "", sumaAlTotal: false },
  ];
  it("suma la plata que suma y deja afuera las senas (son parte del mismo turno)", () => {
    expect(totalRetorno(lineas)).toBe(226000);
  });
  it("marca el total como estimado si alguna linea que suma lo es", () => {
    const r = armarRetorno({ dias: 30, mensajesAgente: 7200, minutosPorMensaje: 3, recuperadas: 20, lineasModulos: lineas });
    expect(r.totalCentavos).toBe(226000);
    expect(r.totalEstimado).toBe(true);
    expect(r.lineas[0].clave).toBe("horas_ahorradas");
    // El modulo trae el recupero con precio: el nucleo no agrega la linea de cantidad.
    expect(r.lineas.filter((l) => l.clave === "recuperado_seguimiento")).toHaveLength(1);
  });
  it("sin modulo con precios, el recupero se muestra como cantidad y el total es 0", () => {
    const r = armarRetorno({ dias: 30, mensajesAgente: 10, minutosPorMensaje: 3, recuperadas: 4, lineasModulos: [] });
    expect(r.lineas.find((l) => l.clave === "recuperado_seguimiento")?.valorTexto).toBe("4");
    expect(r.totalCentavos).toBe(0);
  });
});

describe("retorno: la cuenta se lee", () => {
  it("con un solo precio lo muestra; con varios, el promedio", () => {
    expect(cuentaPorPrecio(3, [8000, 8000, 8000], "turnos", fmt)).toBe("3 turnos x USD 80");
    expect(cuentaPorPrecio(2, [4000, 8000], "turnos", fmt)).toBe("2 turnos x USD 60 promedio");
    expect(cuentaPorPrecio(10, Array(10).fill(8000), "confirmados", fmt, { texto: "15% de ausencia" })).toBe("10 confirmados x 15% de ausencia x USD 80");
    expect(cuentaPorPrecio(0, [], "turnos", fmt)).toBe("0 turnos");
  });
});

describe("retorno: conversaciones recuperadas", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 1, 12, min));
  const seg = { seguimiento: { paso: 1 } };
  it("cuenta solo las que volvieron a escribir DESPUES del primer seguimiento", () => {
    const ids = conversacionesRecuperadas([
      { conversationId: "a", direction: "in", createdAt: t(0), rawPayload: null },
      { conversationId: "a", direction: "out", createdAt: t(10), rawPayload: seg },
      { conversationId: "a", direction: "in", createdAt: t(20), rawPayload: null },
      { conversationId: "b", direction: "in", createdAt: t(0), rawPayload: null },
      { conversationId: "b", direction: "out", createdAt: t(10), rawPayload: seg },
      { conversationId: "c", direction: "in", createdAt: t(0), rawPayload: null },
      { conversationId: "c", direction: "out", createdAt: t(5), rawPayload: null },
      { conversationId: "c", direction: "in", createdAt: t(20), rawPayload: null },
    ]);
    expect(ids).toEqual(["a"]);
  });
});

describe("modulos: rutas publicas", () => {
  it("solo el segmento publico justo despues del modulo", () => {
    expect(esRutaPublicaDeModulo("/m/agenda/publico/pago/123")).toBe(true);
    expect(esRutaPublicaDeModulo("/api/m/agenda/publico/pago/123")).toBe(true);
    expect(esRutaPublicaDeModulo("/m/agenda")).toBe(false);
    expect(esRutaPublicaDeModulo("/m/agenda/pago/123")).toBe(false);
    expect(esRutaPublicaDeModulo("/m/agenda/x/publico")).toBe(false);
    expect(esRutaPublicaDeModulo("/api/m/agenda/probar")).toBe(false);
    expect(esRutaPublicaDeModulo("/m/agenda/publicos")).toBe(false);
  });
});
