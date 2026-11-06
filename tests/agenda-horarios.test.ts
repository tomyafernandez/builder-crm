import { describe, it, expect } from "vitest";
import { elegirOpciones, etiquetaHorario, fueOfrecido, huecosLibres, instanteLocal } from "@modules/agenda/lib/horarios";

/**
 * Modulo agenda. Lo que falla en silencio: ofrecer una hora en la zona equivocada (el
 * cliente se conecta a la llamada una hora antes), ofrecer un horario ocupado, o
 * reservar algo que no se ofrecio.
 */
const BA = "America/Argentina/Buenos_Aires";
const ajustes = { dias: [1, 2, 3, 4, 5], desde: "10:00", hasta: "12:00", duracionMin: 30, anticipacionMin: 120, diasAdelante: 7 };

describe("agenda: zona horaria", () => {
  it("las 10:00 de Buenos Aires son las 13:00 UTC", () => {
    expect(instanteLocal(2026, 11, 10, "10:00", BA).toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });
  it("respeta el horario de verano de otra zona", () => {
    // Madrid: UTC+1 en noviembre, UTC+2 en julio.
    expect(instanteLocal(2026, 11, 10, "10:00", "Europe/Madrid").toISOString()).toBe("2026-11-10T09:00:00.000Z");
    expect(instanteLocal(2026, 7, 10, "10:00", "Europe/Madrid").toISOString()).toBe("2026-07-10T08:00:00.000Z");
  });
});

describe("agenda: huecos libres", () => {
  // Viernes 6/11/2026 14:00 en Buenos Aires.
  const ahora = new Date("2026-11-06T17:00:00.000Z");

  it("solo dias habiles, dentro del horario y con el aviso minimo", () => {
    const h = huecosLibres({ ahora, zona: BA, ajustes, ocupados: [] });
    // Hoy ya paso el horario; sabado y domingo no; arranca el lunes 9 a las 10:00.
    expect(h[0].inicio.toISOString()).toBe("2026-11-09T13:00:00.000Z");
    expect(h.every((x) => [1, 2, 3, 4, 5].includes(new Date(x.inicio.getTime() - 3 * 3600_000).getUTCDay()))).toBe(true);
    // 4 huecos de 30 min por dia (10 a 12)
    expect(h.filter((x) => x.inicio.toISOString().startsWith("2026-11-09")).length).toBe(4);
  });

  it("no ofrece lo ocupado en el calendario", () => {
    const ocupado = { inicio: new Date("2026-11-09T13:00:00.000Z"), fin: new Date("2026-11-09T14:00:00.000Z") };
    const h = huecosLibres({ ahora, zona: BA, ajustes, ocupados: [ocupado] });
    expect(h[0].inicio.toISOString()).toBe("2026-11-09T14:00:00.000Z");
  });

  it("respeta el aviso minimo dentro del mismo dia", () => {
    const lunes0930 = new Date("2026-11-09T12:30:00.000Z");
    const h = huecosLibres({ ahora: lunes0930, zona: BA, ajustes, ocupados: [] });
    // 09:30 + 2 h = 11:30 -> el primero es 11:30.
    expect(h[0].inicio.toISOString()).toBe("2026-11-09T14:30:00.000Z");
  });

  it("ofrece pocas opciones repartidas en dias distintos", () => {
    const h = huecosLibres({ ahora, zona: BA, ajustes, ocupados: [] });
    const op = elegirOpciones(h, BA, 4);
    expect(op.length).toBe(4);
    expect(new Set(op.map((o) => o.inicio.toISOString().slice(0, 10))).size).toBe(2);
  });

  it("etiqueta en castellano y en la hora local", () => {
    expect(etiquetaHorario(new Date("2026-11-09T13:00:00.000Z"), BA)).toBe("lunes, 9 de noviembre, 10:00");
  });

  it("solo se reserva lo ofrecido", () => {
    const ofrecidos = [{ inicio: new Date("2026-11-09T13:00:00.000Z"), fin: new Date("2026-11-09T13:30:00.000Z") }];
    expect(fueOfrecido(new Date("2026-11-09T13:00:00.000Z"), ofrecidos)).not.toBeNull();
    expect(fueOfrecido(new Date("2026-11-09T15:00:00.000Z"), ofrecidos)).toBeNull();
  });
});

describe("agenda: el agente reserva diciendo el horario como lo ofrecio", () => {
  const ofrecidos = [
    { inicio: new Date("2026-11-09T13:30:00.000Z"), fin: new Date("2026-11-09T14:00:00.000Z") }, // lun 9 10:30
    { inicio: new Date("2026-11-09T14:30:00.000Z"), fin: new Date("2026-11-09T15:00:00.000Z") }, // lun 9 11:30
    { inicio: new Date("2026-11-10T13:30:00.000Z"), fin: new Date("2026-11-10T14:00:00.000Z") }, // mar 10 10:30
  ];
  it("con la etiqueta exacta, con otras palabras o con el ISO", async () => {
    const { buscarOfrecidoPorTexto } = await import("@modules/agenda/lib/horarios");
    expect(buscarOfrecidoPorTexto("lunes, 9 de noviembre, 10:30", ofrecidos, BA)?.inicio.toISOString()).toBe("2026-11-09T13:30:00.000Z");
    expect(buscarOfrecidoPorTexto("el martes 10 a las 10:30", ofrecidos, BA)?.inicio.toISOString()).toBe("2026-11-10T13:30:00.000Z");
    expect(buscarOfrecidoPorTexto("11:30", ofrecidos, BA)?.inicio.toISOString()).toBe("2026-11-09T14:30:00.000Z");
    expect(buscarOfrecidoPorTexto("2026-11-10T13:30:00.000Z", ofrecidos, BA)).not.toBeNull();
  });
  it("si es ambiguo o no se ofrecio, no reserva nada", async () => {
    const { buscarOfrecidoPorTexto } = await import("@modules/agenda/lib/horarios");
    expect(buscarOfrecidoPorTexto("10:30", ofrecidos, BA)).toBeNull(); // lunes o martes?
    expect(buscarOfrecidoPorTexto("jueves 12 a las 16:00", ofrecidos, BA)).toBeNull();
    expect(buscarOfrecidoPorTexto("cuando puedas", ofrecidos, BA)).toBeNull();
  });
});
