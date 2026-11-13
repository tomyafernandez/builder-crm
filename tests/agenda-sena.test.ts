import { describe, it, expect } from "vitest";
import {
  buscarServicio,
  calcularSena,
  cuandoRelativo,
  decidirRecordatorio,
  ocupaHorario,
  reservaVencida,
  textoRecordatorio,
  type EntradaRecordatorio,
} from "@modules/agenda/lib/sena";
import { huecosLibres } from "@modules/agenda/lib/horarios";

/**
 * Agenda con sena (spec nucleo/19). Lo que falla en silencio: una reserva sin pagar que
 * bloquea un horario para siempre, una sena mal calculada, un recordatorio a las 3 de la
 * manana o dos veces, o un "manana" que en realidad es pasado manana por la zona horaria.
 */
const BA = "America/Argentina/Buenos_Aires";
const h = (iso: string) => new Date(iso);

describe("sena: calculo", () => {
  it("es el porcentaje del precio, en centavos y redondeado", () => {
    expect(calcularSena(8000, 30)).toBe(2400);
    expect(calcularSena(28000, 30)).toBe(8400);
    expect(calcularSena(4000, 30)).toBe(1200);
    expect(calcularSena(3333, 30)).toBe(1000); // 999,9 -> 1000
  });
  it("sin porcentaje, con 0 o sin precio no hay sena", () => {
    expect(calcularSena(8000, null)).toBeNull();
    expect(calcularSena(8000, 0)).toBeNull();
    expect(calcularSena(0, 30)).toBeNull();
    expect(calcularSena(null, 30)).toBeNull();
  });
  it("nunca cobra mas que el precio", () => {
    expect(calcularSena(8000, 150)).toBe(8000);
  });
});

describe("sena: vencimiento y disponibilidad", () => {
  const ahora = h("2026-11-13T15:00:00Z");
  const base = { inicio: h("2026-11-14T13:00:00Z"), fin: h("2026-11-14T14:00:00Z"), senaPagadaAt: null };

  it("una reserva pendiente dentro del plazo ocupa el horario", () => {
    const c = { ...base, estado: "pendiente_sena", senaVenceAt: h("2026-11-13T15:30:00Z") };
    expect(reservaVencida(c, ahora)).toBe(false);
    expect(ocupaHorario(c, ahora)).toBe(true);
  });
  it("con el plazo cumplido ya no ocupa, aunque el barrido no la haya marcado", () => {
    const c = { ...base, estado: "pendiente_sena", senaVenceAt: h("2026-11-13T14:59:00Z") };
    expect(reservaVencida(c, ahora)).toBe(true);
    expect(ocupaHorario(c, ahora)).toBe(false);
  });
  it("si la sena ya se pago no vence nunca", () => {
    const c = { ...base, estado: "pendiente_sena", senaVenceAt: h("2026-11-13T14:00:00Z"), senaPagadaAt: h("2026-11-13T13:50:00Z") };
    expect(reservaVencida(c, ahora)).toBe(false);
    expect(ocupaHorario(c, ahora)).toBe(true);
  });
  it("vencida y cancelada liberan; confirmada y agendada ocupan", () => {
    expect(ocupaHorario({ ...base, estado: "vencida", senaVenceAt: null }, ahora)).toBe(false);
    expect(ocupaHorario({ ...base, estado: "cancelada", senaVenceAt: null }, ahora)).toBe(false);
    expect(ocupaHorario({ ...base, estado: "confirmada", senaVenceAt: null }, ahora)).toBe(true);
    expect(ocupaHorario({ ...base, estado: "agendada", senaVenceAt: null }, ahora)).toBe(true);
  });
  it("los huecos libres saltean la reserva pendiente y vuelven a ofrecer la vencida", () => {
    const ajustes = { dias: [6], desde: "10:00", hasta: "12:00", duracionMin: 60, anticipacionMin: 0, diasAdelante: 2 };
    const pendiente = { ...base, estado: "pendiente_sena", senaVenceAt: h("2026-11-13T15:30:00Z") };
    const vencida = { ...base, estado: "pendiente_sena", senaVenceAt: h("2026-11-13T14:00:00Z") };
    const con = (c: typeof pendiente) => huecosLibres({ ahora, zona: BA, ajustes, ocupados: [c].filter((x) => ocupaHorario(x, ahora)) });
    // Sabado 14/11 a las 10:00 de Buenos Aires = 13:00 UTC.
    expect(con(pendiente).map((x) => x.inicio.toISOString())).toEqual(["2026-11-14T14:00:00.000Z"]);
    expect(con(vencida).map((x) => x.inicio.toISOString())).toEqual(["2026-11-14T13:00:00.000Z", "2026-11-14T14:00:00.000Z"]);
  });
});

describe("sena: servicio elegido", () => {
  const servicios = [
    { nombre: "Primera consulta", precioCentavos: 4000 },
    { nombre: "Sesión individual", precioCentavos: 8000 },
    { nombre: "Plan mensual (4 sesiones)", precioCentavos: 28000 },
  ];
  it("empareja sin tildes ni mayusculas, y por parte del nombre si no es ambiguo", () => {
    expect(buscarServicio("sesion individual", servicios)?.precioCentavos).toBe(8000);
    expect(buscarServicio("Plan mensual", servicios)?.precioCentavos).toBe(28000);
    expect(buscarServicio("primera", servicios)?.precioCentavos).toBe(4000);
  });
  it("ambiguo o inexistente: null (mejor preguntar que cobrar el equivocado)", () => {
    expect(buscarServicio("sesion", servicios)).toBeNull();
    expect(buscarServicio("masaje", servicios)).toBeNull();
    expect(buscarServicio("", servicios)).toBeNull();
  });
});

describe("recordatorio: cuando toca", () => {
  // Jueves 13/11/2026 18:00 en Buenos Aires (21:00 UTC). Turno viernes 14 a las 17:00 (20:00 UTC).
  const base: EntradaRecordatorio = {
    ahora: h("2026-11-13T21:00:00Z"),
    zona: BA,
    activo: true,
    horasAntes: 24,
    plantilla: null,
    cita: { estado: "confirmada", inicio: h("2026-11-14T20:00:00Z"), recordatorioEnviadoAt: null },
    conversacion: { channel: "whatsapp", lastInboundAt: h("2026-11-13T15:00:00Z") },
  };

  it("faltando 23 h, en horario y con la ventana abierta: texto", () => {
    expect(decidirRecordatorio(base)).toEqual({ enviar: true, modo: "texto" });
  });
  it("faltando mas de las horas configuradas: todavia no", () => {
    expect(decidirRecordatorio({ ...base, ahora: h("2026-11-13T19:00:00Z") })).toMatchObject({ enviar: false, motivo: "todavia no" });
  });
  it("a las 22:00 del negocio no se manda, aunque en UTC sea de dia en otro lado", () => {
    // 01:00 UTC del 14 = 22:00 del 13 en Buenos Aires.
    expect(decidirRecordatorio({ ...base, ahora: h("2026-11-14T01:00:00Z") })).toMatchObject({ enviar: false, motivo: "fuera de horario" });
    // 12:00 UTC = 09:00 en Buenos Aires: ya se puede.
    expect(decidirRecordatorio({ ...base, ahora: h("2026-11-14T12:00:00Z") })).toMatchObject({ enviar: true });
  });
  it("una sola vez", () => {
    expect(decidirRecordatorio({ ...base, cita: { ...base.cita, recordatorioEnviadoAt: h("2026-11-13T20:00:00Z") } })).toMatchObject({ enviar: false });
  });
  it("no a reservas sin pagar, canceladas ni pasadas", () => {
    expect(decidirRecordatorio({ ...base, cita: { ...base.cita, estado: "pendiente_sena" } })).toMatchObject({ enviar: false });
    expect(decidirRecordatorio({ ...base, cita: { ...base.cita, estado: "cancelada" } })).toMatchObject({ enviar: false });
    expect(decidirRecordatorio({ ...base, ahora: h("2026-11-14T21:00:00Z") })).toMatchObject({ enviar: false, motivo: "ya paso" });
  });
  it("apagado no manda nada", () => {
    expect(decidirRecordatorio({ ...base, activo: false })).toMatchObject({ enviar: false });
  });
  it("fuera de las 24 h: WhatsApp con plantilla; sin plantilla o en Instagram, nada", () => {
    const vieja = { channel: "whatsapp", lastInboundAt: h("2026-11-11T15:00:00Z") };
    expect(decidirRecordatorio({ ...base, conversacion: vieja })).toMatchObject({ enviar: false });
    expect(decidirRecordatorio({ ...base, conversacion: vieja, plantilla: "recordatorio_turno" })).toEqual({ enviar: true, modo: "plantilla", plantilla: "recordatorio_turno" });
    expect(decidirRecordatorio({ ...base, conversacion: { ...vieja, channel: "instagram" }, plantilla: "x" })).toMatchObject({ enviar: false });
  });
  it("la prueba del simulador no espera las horas ni mira el horario", () => {
    expect(decidirRecordatorio({ ...base, ahora: h("2026-11-14T01:00:00Z"), ignorarEspera: true })).toMatchObject({ enviar: true });
    expect(decidirRecordatorio({ ...base, ahora: h("2026-11-10T15:00:00Z"), ignorarEspera: true })).toMatchObject({ enviar: true });
  });
});

describe("recordatorio: el dia se nombra en la zona del negocio", () => {
  it("hoy, manana y otro dia", () => {
    const ahora = h("2026-11-13T21:00:00Z"); // jueves 18:00 en BA
    expect(cuandoRelativo(h("2026-11-13T23:00:00Z"), ahora, BA)).toBe("hoy a las 20:00");
    expect(cuandoRelativo(h("2026-11-14T20:00:00Z"), ahora, BA)).toBe("mañana a las 17:00");
    expect(cuandoRelativo(h("2026-11-16T13:00:00Z"), ahora, BA)).toBe("el lunes 16 a las 10:00");
  });
  it("a las 23:30 de BA ya es otro dia en UTC: 'manana' sigue siendo el dia siguiente de BA", () => {
    const ahora = h("2026-11-14T02:30:00Z"); // jueves 13 23:30 en BA, viernes 14 en UTC
    expect(cuandoRelativo(h("2026-11-14T20:00:00Z"), ahora, BA)).toBe("mañana a las 17:00");
  });
  it("el texto saluda por el nombre y no al 'Cliente simulado'", () => {
    expect(textoRecordatorio("Lucía Paz", "mañana a las 17:00", "Sesión individual")).toBe(
      "Hola Lucía, te recuerdo tu turno de sesión individual mañana a las 17:00. Me confirmás que venís?"
    );
    expect(textoRecordatorio("Cliente simulado 1a2b", "hoy a las 10:00", null)).toBe("Hola, te recuerdo tu turno hoy a las 10:00. Me confirmás que venís?");
  });
});

describe("mensajes al cliente", () => {
  it("la fecha se dice como una persona, en la zona del negocio", async () => {
    const { fechaParaCliente, textoConfirmada } = await import("@modules/agenda/lib/sena");
    const f = fechaParaCliente(new Date("2026-11-14T17:00:00Z"), BA);
    expect(f).toBe("sábado 14 de noviembre a las 14:00");
    expect(textoConfirmada(f, "Sesión individual")).toBe("Recibimos tu seña, tu turno de sesión individual quedó confirmado para el sábado 14 de noviembre a las 14:00. Te esperamos.");
  });
});
