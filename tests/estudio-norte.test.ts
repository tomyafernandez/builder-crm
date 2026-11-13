import { describe, it, expect } from "vitest";
import { generar } from "@modules/estudio_norte/lib/generar";

/**
 * Rama demo: la tarjeta de retorno tiene que dar SIEMPRE lo mismo (es lo que se ve en el
 * video y en la web), se siembre el dia y la hora que sea. Mismo calculo que la tarjeta:
 * ultimos 30 dias, 1,5 min por mensaje, sueldo de referencia USD 700 por 160 h, 15% de
 * ausencia.
 */
const DIA = 86_400_000;

function tarjeta(ahora: number) {
  const f = generar(ahora, () => "x");
  const desde = ahora - 30 * DIA;
  const agente = f.flatMap((x) => x.mensajes).filter((m) => m.at >= desde && m.dir === "out" && (m.origen ?? "agent") === "agent").length;
  const horas = Math.round(((agente * 1.5) / 60 / 160) * 70000);
  const ok = (e: string) => e !== "cancelada" && e !== "vencida";
  const recuperada = (x: (typeof f)[number]) => {
    const s = [...x.mensajes].sort((a, b) => a.at - b.at);
    const p = s.find((m) => m.seguimiento);
    return Boolean(p && s.some((m) => m.dir === "in" && m.at > p.at));
  };
  const recuperado = f.filter((x) => x.cita && ok(x.cita.estado) && x.cita.creada >= desde && recuperada(x)).reduce((t, x) => t + x.cita!.precio, 0);
  const citas = f.flatMap((x) => (x.cita ? [x.cita] : []));
  const ausencias = Math.round(
    citas.filter((c) => c.recordatorio && c.recordatorio >= desde && c.confirmo && c.confirmo > c.recordatorio && ok(c.estado)).reduce((t, c) => t + c.precio, 0) * 0.15
  );
  // Nada del futuro.
  const futuro = f.flatMap((x) => x.mensajes).filter((m) => m.at > ahora).length;
  return { agente, horas, recuperado, ausencias, total: horas + recuperado + ausencias, futuro, consultas: f.length };
}

describe("estudio norte: datos deterministicos", () => {
  const base = Date.UTC(2026, 10, 13, 22, 0);
  const momentos = [0, 3.5, 11, 16.25, 20.9].flatMap((h) => [0, 1, 5, 40, 200].map((d) => base + d * DIA + h * 3600_000));

  it("la tarjeta da lo mismo cualquier dia y a cualquier hora", () => {
    const primera = tarjeta(momentos[0]);
    for (const t of momentos) {
      const r = tarjeta(t);
      expect({ ...r, futuro: 0 }).toEqual({ ...primera, futuro: 0 });
      expect(r.futuro).toBe(0);
    }
  });

  it("coincide con el caso de la web: ~USD 2.300 al mes y ~160 h", () => {
    const r = tarjeta(base);
    expect(r.total).toBeGreaterThan(225_000);
    expect(r.total).toBeLessThan(235_000);
    expect(Math.round((r.agente * 1.5) / 60)).toBeGreaterThanOrEqual(155);
    expect(Math.round((r.agente * 1.5) / 60)).toBeLessThanOrEqual(165);
    expect(r.consultas / 30).toBeGreaterThan(55);
  });
});
