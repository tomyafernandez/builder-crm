import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, conversations } from "@/db/schema";
import { deliverMessage } from "@/lib/channels/deliver";
import { formatCurrency } from "@/lib/constants";
import { agendaCitas, agendaOfrecidos } from "../tabla";
import { crearEvento, moverEvento } from "./google";
import { buscarOfrecidoPorTexto, etiquetaHorario } from "./horarios";
import { ESTADOS_ACTIVOS, ETAPA_TURNO_CONFIRMADO, fechaParaCliente, reservaVencida, textoConfirmada, textoVencida, ventanaAbierta } from "./sena";
import { moverEtapaPorClave } from "./etapas";
import { proveedorPago } from "./pagos";
import { leerAjustes, ocupados, tokenGoogle, zona } from "./servicio";

/**
 * El ciclo de vida de un turno despues de reservarlo (spec nucleo/19): pago de la sena,
 * vencimiento, confirmacion del cliente y reprogramacion. Todo mensaje al cliente sale por
 * `deliverMessage`.
 */

export type Cita = typeof agendaCitas.$inferSelect;

export async function leerCita(id: string): Promise<Cita | null> {
  const [c] = await db.select().from(agendaCitas).where(eq(agendaCitas.id, id)).limit(1);
  return c ?? null;
}

async function descripcionEvento(c: Cita, descripcionBase: string | null) {
  const [contacto] = await db.select({ phone: contacts.phone }).from(contacts).where(eq(contacts.id, c.contactId)).limit(1);
  return [
    descripcionBase,
    c.servicio ? `Servicio: ${c.servicio}` : null,
    c.senaCentavos ? `Sena pagada: ${formatCurrency(c.senaCentavos)}` : null,
    contacto?.phone ? `Telefono: ${contacto.phone}` : null,
    c.notas ? `Notas: ${c.notas}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function derivar(conversationId: string | null, motivo: string) {
  if (!conversationId) return;
  await db
    .update(conversations)
    .set({ needsHuman: true, needsHumanReason: motivo, needsHumanAt: new Date(), aiEnabled: false, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

async function avisar(conversationId: string | null, texto: string) {
  if (!conversationId) return { ok: false as const };
  const [conv] = await db.select({ lastInboundAt: conversations.lastInboundAt }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  // Fuera de la ventana de 24 h no se manda texto libre (ver spec nucleo/18 y 19).
  if (!conv || !ventanaAbierta(conv.lastInboundAt, new Date())) return { ok: false as const };
  return deliverMessage(conversationId, { text: texto }, "agent", { leidoHasta: conv.lastInboundAt });
}

export type ResultadoPago =
  | { ok: true; estado: "confirmada"; etiqueta: string }
  | { ok: true; estado: "pagada_sin_confirmar"; etiqueta: string }
  | { ok: false; motivo: "no_encontrada" | "vencida" | "cancelada" | "sin_sena" };

/**
 * Se acredito la sena. Idempotente: pagar dos veces no duplica el evento ni el mensaje.
 * Si Google falla, la sena queda registrada pero el turno NO se confirma: se deriva a una
 * persona (garantia 3: nunca confirmar sin el evento).
 */
export async function confirmarPago(citaId: string, referencia?: string): Promise<ResultadoPago> {
  const c = await leerCita(citaId);
  if (!c) return { ok: false, motivo: "no_encontrada" };
  const z = zona();
  const etiqueta = etiquetaHorario(c.inicio, z);
  if (c.estado === "confirmada" || c.estado === "asistio") return { ok: true, estado: "confirmada", etiqueta };
  if (c.senaPagadaAt) return { ok: true, estado: "pagada_sin_confirmar", etiqueta };
  if (c.estado === "cancelada") return { ok: false, motivo: "cancelada" };
  if (c.estado === "vencida" || reservaVencida(c, new Date())) return { ok: false, motivo: "vencida" };
  if (c.estado !== "pendiente_sena" || !c.senaCentavos) return { ok: false, motivo: "sin_sena" };

  const a = await leerAjustes();
  const verificado = await proveedorPago(a.proveedorPago).verificarCobro(referencia ?? c.pagoReferencia ?? "");
  if (!verificado.pagado) return { ok: false, motivo: "sin_sena" };

  // Reclamo atomico: solo una llamada pasa de "sin pagar" a "pagada".
  const reclamadas = await db
    .update(agendaCitas)
    .set({ senaPagadaAt: new Date(), pagoReferencia: referencia ?? c.pagoReferencia, updatedAt: new Date() })
    .where(and(eq(agendaCitas.id, c.id), eq(agendaCitas.estado, "pendiente_sena")))
    .returning({ id: agendaCitas.id });
  if (reclamadas.length === 0) return { ok: true, estado: "pagada_sin_confirmar", etiqueta };

  const token = tokenGoogle(a);
  let evento: { id: string; meet: string | null; link: string | null } | null = null;
  if (token) {
    try {
      evento = await crearEvento(token, a.googleCalendarId, {
        inicio: c.inicio,
        fin: c.fin,
        zona: z,
        titulo: c.titulo,
        descripcion: await descripcionEvento(c, a.descripcion),
        email: c.emailInvitado,
      });
    } catch (err) {
      console.error("[agenda] sena pagada pero no se pudo crear el evento:", err instanceof Error ? err.message : err);
      await derivar(c.conversationId, `Pago la sena del ${etiqueta} pero no se pudo crear el evento en Google Calendar. Confirmar a mano.`);
      await db.insert(activities).values({ type: "note", description: `Sena pagada (${formatCurrency(c.senaCentavos)}); falta confirmar el turno a mano`, contactId: c.contactId });
      await avisar(c.conversationId, "Recibimos tu seña. En un rato alguien del equipo te confirma el turno.");
      return { ok: true, estado: "pagada_sin_confirmar", etiqueta };
    }
  }

  await db
    .update(agendaCitas)
    .set({
      estado: "confirmada",
      googleEventId: evento?.id ?? null,
      meetLink: evento?.meet ?? null,
      googleLink: evento?.link ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agendaCitas.id, c.id));
  await moverEtapaPorClave(c.contactId, ETAPA_TURNO_CONFIRMADO, { motivo: `Sena pagada (${formatCurrency(c.senaCentavos)})` });
  await db.insert(activities).values({
    type: "meeting",
    description: `Sena pagada (${formatCurrency(c.senaCentavos)}): turno confirmado ${etiqueta}${evento ? " y agregado al calendario" : ""}`,
    contactId: c.contactId,
  });
  await avisar(c.conversationId, textoConfirmada(fechaParaCliente(c.inicio, z), c.servicio));
  return { ok: true, estado: "confirmada", etiqueta };
}

/** Pasa una reserva sin pagar a `vencida` y avisa con amabilidad. */
export async function vencerReserva(c: Cita): Promise<boolean> {
  const marcadas = await db
    .update(agendaCitas)
    .set({ estado: "vencida", updatedAt: new Date() })
    .where(and(eq(agendaCitas.id, c.id), eq(agendaCitas.estado, "pendiente_sena")))
    .returning({ id: agendaCitas.id });
  if (marcadas.length === 0) return false;
  const etiqueta = etiquetaHorario(c.inicio, zona());
  await db.insert(activities).values({ type: "note", description: `Reserva vencida sin sena: se libero el ${etiqueta}`, contactId: c.contactId });
  await avisar(c.conversationId, textoVencida(fechaParaCliente(c.inicio, zona())));
  return true;
}

/** Turnos que vienen (activos) de un contacto, para el agente. */
export async function misTurnos(contactId: string) {
  const z = zona();
  const filas = await db
    .select()
    .from(agendaCitas)
    .where(and(eq(agendaCitas.contactId, contactId), inArray(agendaCitas.estado, [...ESTADOS_ACTIVOS]), gte(agendaCitas.fin, new Date())))
    .orderBy(asc(agendaCitas.inicio));
  const ahora = new Date();
  return filas
    .filter((c) => !reservaVencida(c, ahora))
    .map((c) => ({
      id: c.id,
      cuando: etiquetaHorario(c.inicio, z),
      servicio: c.servicio,
      estado: c.estado === "pendiente_sena" ? "espera la sena" : "confirmado",
      senaPagada: Boolean(c.senaPagadaAt),
      confirmoAsistencia: Boolean(c.confirmadaPorClienteAt),
    }));
}

/** El turno al que se refiere el agente: por id o, si no lo da, el proximo. */
async function turnoDe(contactId: string, id?: string | null): Promise<Cita | null> {
  const lista = await misTurnos(contactId);
  const elegido = id ? lista.find((t) => t.id === id) : lista[0];
  return elegido ? leerCita(elegido.id) : null;
}

export async function confirmarAsistencia(contactId: string, id?: string | null) {
  const c = await turnoDe(contactId, id);
  if (!c) return { ok: false as const, motivo: "No tiene turnos proximos. Revisa con agenda_mis_turnos." };
  if (c.estado === "pendiente_sena") return { ok: false as const, motivo: "Ese turno todavia espera la sena: primero tiene que pagarla." };
  await db.update(agendaCitas).set({ confirmadaPorClienteAt: new Date(), updatedAt: new Date() }).where(eq(agendaCitas.id, c.id));
  const etiqueta = etiquetaHorario(c.inicio, zona());
  await db.insert(activities).values({ type: "note", description: `Confirmo que viene al turno del ${etiqueta}`, contactId });
  return { ok: true as const, cuando: etiqueta };
}

/**
 * Mueve un turno a un horario OFRECIDO a esta conversacion (garantia 1), revalidando que
 * siga libre (garantia 2). Conserva la sena. Si hay evento en Google y no se puede mover,
 * no cambia nada (garantia 3).
 */
export async function reprogramar(input: { contactId: string; conversationId: string | null; horario: string; turno?: string | null }) {
  const c = await turnoDe(input.contactId, input.turno);
  if (!c) return { ok: false as const, motivo: "No tiene turnos proximos para cambiar. Revisa con agenda_mis_turnos." };
  const a = await leerAjustes();
  const z = zona();
  const ofrecidos = input.conversationId
    ? await db.select({ inicio: agendaOfrecidos.inicio, fin: agendaOfrecidos.fin }).from(agendaOfrecidos).where(eq(agendaOfrecidos.conversationId, input.conversationId))
    : [];
  const elegido = buscarOfrecidoPorTexto(input.horario, ofrecidos, z);
  if (!elegido) {
    return {
      ok: false as const,
      motivo: ofrecidos.length === 0 ? "Primero ofrece horarios con agenda_ver_horarios." : "Ese horario no coincide con los ofrecidos. Volve a ofrecer con agenda_ver_horarios.",
    };
  }
  const duracion = c.fin.getTime() - c.inicio.getTime();
  const nuevo = { inicio: elegido.inicio, fin: new Date(elegido.inicio.getTime() + duracion) };
  const choques = await ocupados(a, nuevo.inicio, nuevo.fin, { citaId: c.id, googleEventId: c.googleEventId });
  if (choques.some((o) => o.inicio < nuevo.fin && nuevo.inicio < o.fin)) {
    return { ok: false as const, motivo: "Ese horario se acaba de ocupar. Ofrece otros con agenda_ver_horarios." };
  }
  const token = tokenGoogle(a);
  if (token && c.googleEventId) {
    try {
      await moverEvento(token, a.googleCalendarId, c.googleEventId, { ...nuevo, zona: z });
    } catch (err) {
      console.error("[agenda] no se pudo mover el evento:", err instanceof Error ? err.message : err);
      return { ok: false as const, motivo: "No se pudo mover el turno en el calendario. No confirmes el cambio: deriva a una persona." };
    }
  }
  const antes = etiquetaHorario(c.inicio, z);
  await db
    .update(agendaCitas)
    .set({
      inicio: nuevo.inicio,
      fin: nuevo.fin,
      // Turno nuevo: se le vuelve a recordar. Elegirlo cuenta como confirmar que viene.
      recordatorioEnviadoAt: null,
      confirmadaPorClienteAt: c.estado === "pendiente_sena" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agendaCitas.id, c.id));
  if (input.conversationId) await db.delete(agendaOfrecidos).where(eq(agendaOfrecidos.conversationId, input.conversationId));
  const despues = etiquetaHorario(nuevo.inicio, z);
  await db.insert(activities).values({ type: "meeting", description: `Turno reprogramado: ${antes} -> ${despues}${c.senaPagadaAt ? " (conserva la sena)" : ""}`, contactId: input.contactId });
  return { ok: true as const, antes, cuando: despues, conservaSena: Boolean(c.senaPagadaAt), esperaSena: c.estado === "pendiente_sena" };
}
