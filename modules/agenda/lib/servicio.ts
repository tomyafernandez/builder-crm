import "server-only";
import { and, eq, gte, lte, notInArray, desc } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { cifradoActivo, cifrar, descifrar } from "@/lib/cifrado";
import { agendaAjustes, agendaCitas, agendaOfrecidos, type ServicioAgenda } from "../tabla";
import {
  AJUSTES_POR_DEFECTO,
  buscarOfrecidoPorTexto,
  elegirOpciones,
  etiquetaHorario,
  huecosLibres,
  type AjustesHorario,
  type Intervalo,
} from "./horarios";
import { crearEvento, googleConfigurado, ocupadoEnGoogle, cancelarEvento } from "./google";
import { buscarServicio, calcularSena, ocupaHorario, ETAPA_SENA_PENDIENTE } from "./sena";
import { proveedorPago } from "./pagos";
import { moverEtapaPorClave } from "./etapas";

/**
 * Logica de la agenda. Garantias (tomadas del motor de agenda de Vocero CRM):
 *   1. El agente solo puede reservar un horario que ofrecio a ESA conversacion.
 *   2. Antes de reservar se vuelve a mirar que siga libre (Google y la propia agenda).
 *   3. Nunca se confirma una cita que no se creo: si Google falla al crear el evento,
 *      la herramienta devuelve error y el agente no puede decir "listo".
 * Sin Google conectado funciona igual con la agenda interna (sin Meet).
 */

export type Ajustes = typeof agendaAjustes.$inferSelect;

export function zona(): string {
  return getConfig().zonaHoraria;
}

export async function leerAjustes(): Promise<Ajustes> {
  const [fila] = await db.select().from(agendaAjustes).where(eq(agendaAjustes.id, "default")).limit(1);
  if (fila) return fila;
  const [creada] = await db
    .insert(agendaAjustes)
    .values({ id: "default", ...AJUSTES_POR_DEFECTO, titulo: `${AJUSTES_POR_DEFECTO.titulo} con ${getConfig().marca.nombre}` })
    .onConflictDoNothing()
    .returning();
  if (creada) return creada;
  const [otra] = await db.select().from(agendaAjustes).where(eq(agendaAjustes.id, "default")).limit(1);
  return otra;
}

export type CambiosAjustes = Partial<
  Pick<
    Ajustes,
    | "dias"
    | "desde"
    | "hasta"
    | "duracionMin"
    | "anticipacionMin"
    | "diasAdelante"
    | "titulo"
    | "descripcion"
    | "servicios"
    | "senaPorcentaje"
    | "senaPlazoMin"
    | "recordatorioActivo"
    | "recordatorioHorasAntes"
    | "recordatorioPlantilla"
    | "proveedorPago"
  >
>;

export async function guardarAjustes(cambios: CambiosAjustes) {
  await leerAjustes();
  await db.update(agendaAjustes).set({ ...cambios, updatedAt: new Date() }).where(eq(agendaAjustes.id, "default"));
  return leerAjustes();
}

export async function guardarConexionGoogle(refreshToken: string, email: string | null) {
  if (!cifradoActivo()) throw new Error("Falta ENCRYPTION_KEY: el acceso a Google se guarda cifrado.");
  await leerAjustes();
  await db
    .update(agendaAjustes)
    .set({ googleRefreshToken: cifrar(refreshToken), googleEmail: email, updatedAt: new Date() })
    .where(eq(agendaAjustes.id, "default"));
}

export async function desconectarGoogle() {
  await db
    .update(agendaAjustes)
    .set({ googleRefreshToken: null, googleEmail: null, updatedAt: new Date() })
    .where(eq(agendaAjustes.id, "default"));
}

export function tokenGoogle(a: Ajustes): string | null {
  if (!a.googleRefreshToken || !googleConfigurado()) return null;
  return descifrar(a.googleRefreshToken);
}

function horario(a: Ajustes): AjustesHorario {
  return {
    dias: a.dias,
    desde: a.desde,
    hasta: a.hasta,
    duracionMin: a.duracionMin,
    anticipacionMin: a.anticipacionMin,
    diasAdelante: a.diasAdelante,
  };
}

/**
 * Lo ocupado entre dos instantes: citas propias que ocupan (spec nucleo/19: una reserva con
 * sena vencida ya no) y lo ocupado en Google. `excluir` deja afuera una cita (al
 * reprogramarla no choca consigo misma) y su evento.
 */
export async function ocupados(a: Ajustes, desde: Date, hasta: Date, excluir?: { citaId: string; googleEventId: string | null }): Promise<Intervalo[]> {
  const ahora = new Date();
  const filas = await db
    .select({
      id: agendaCitas.id,
      estado: agendaCitas.estado,
      inicio: agendaCitas.inicio,
      fin: agendaCitas.fin,
      senaVenceAt: agendaCitas.senaVenceAt,
      senaPagadaAt: agendaCitas.senaPagadaAt,
    })
    .from(agendaCitas)
    .where(and(notInArray(agendaCitas.estado, ["cancelada", "vencida"]), gte(agendaCitas.fin, desde), lte(agendaCitas.inicio, hasta)));
  const propias = filas.filter((c) => c.id !== excluir?.citaId && ocupaHorario(c, ahora)).map((c) => ({ inicio: c.inicio, fin: c.fin }));
  const token = tokenGoogle(a);
  let enGoogle = token ? await ocupadoEnGoogle(token, a.googleCalendarId, desde, hasta) : [];
  // freeBusy no dice que evento es cual: al reprogramar se saca el bloque identico al de
  // la propia cita (si no, su evento la bloquea a si misma cuando se mueve poco).
  if (excluir) {
    const propia = filas.find((c) => c.id === excluir.citaId);
    if (propia) enGoogle = enGoogle.filter((g) => !(g.inicio.getTime() === propia.inicio.getTime() && g.fin.getTime() === propia.fin.getTime()));
  }
  return [...propias, ...enGoogle];
}

/** Servicios configurados con su precio y su sena, para que el agente no invente montos. */
export function serviciosParaAgente(a: Ajustes, fmt: (c: number) => string) {
  return (a.servicios ?? []).map((s) => {
    const sena = calcularSena(s.precioCentavos, a.senaPorcentaje);
    return { nombre: s.nombre, precio: fmt(s.precioCentavos), sena: sena !== null ? fmt(sena) : null };
  });
}

/** Ofrece horarios libres a una conversacion y los recuerda. */
export async function ofrecerHorarios(conversationId: string | null, ahora = new Date()) {
  const a = await leerAjustes();
  const z = zona();
  const hasta = new Date(ahora.getTime() + (a.diasAdelante + 1) * 86_400_000);
  const libres = huecosLibres({ ahora, zona: z, ajustes: horario(a), ocupados: await ocupados(a, ahora, hasta) });
  const opciones = elegirOpciones(libres, z, 4);
  if (conversationId && opciones.length > 0) {
    await db.delete(agendaOfrecidos).where(eq(agendaOfrecidos.conversationId, conversationId));
    await db.insert(agendaOfrecidos).values(opciones.map((o) => ({ conversationId, inicio: o.inicio, fin: o.fin })));
  }
  return opciones.map((o) => ({ inicio: o.inicio.toISOString(), etiqueta: etiquetaHorario(o.inicio, z) }));
}

export type ResultadoAgendar =
  | {
      ok: true;
      cita: {
        id: string;
        etiqueta: string;
        meet: string | null;
        invitacionEnviada: boolean;
        /** Con sena: la cita queda pendiente hasta que se pague. */
        pendienteSena?: { montoCentavos: number; linkPago: string; venceEnMin: number; servicio: string };
      };
    }
  | { ok: false; motivo: string };

export async function agendar(input: {
  contactId: string;
  conversationId: string | null;
  /** Persona: el instante elegido. Agente: el horario como lo ofrecio (texto o ISO). */
  inicio: Date | string;
  email?: string | null;
  notas?: string | null;
  origen?: "agente" | "persona";
  /** Nombre del servicio. Obligatorio si la agenda tiene servicios configurados. */
  servicio?: string | null;
}): Promise<ResultadoAgendar> {
  const a = await leerAjustes();
  const z = zona();
  let intervalo: Intervalo;

  // Spec nucleo/19: con servicios configurados, se agenda UN servicio de la lista.
  const servicios = (a.servicios ?? []) as ServicioAgenda[];
  let servicio: ServicioAgenda | null = null;
  if (servicios.length > 0) {
    servicio = buscarServicio(input.servicio, servicios);
    if (!servicio) {
      return {
        ok: false,
        motivo: `${input.servicio ? `No hay un servicio "${input.servicio}".` : "Falta el servicio."} Servicios: ${servicios.map((x) => x.nombre).join(", ")}. Pregunta cual quiere y volve a llamar con el nombre exacto.`,
      };
    }
  }
  const senaCentavos = calcularSena(servicio?.precioCentavos, a.senaPorcentaje);

  if (input.origen !== "persona") {
    // Garantia 1: solo lo ofrecido a esta conversacion.
    const ofrecidos = input.conversationId
      ? await db.select({ inicio: agendaOfrecidos.inicio, fin: agendaOfrecidos.fin }).from(agendaOfrecidos).where(eq(agendaOfrecidos.conversationId, input.conversationId))
      : [];
    const texto = input.inicio instanceof Date ? input.inicio.toISOString() : input.inicio;
    const elegido = buscarOfrecidoPorTexto(texto, ofrecidos, z);
    if (!elegido) {
      return {
        ok: false,
        motivo:
          ofrecidos.length === 0
            ? "Todavia no ofreciste horarios en esta conversacion. Usa agenda_ver_horarios y ofrece opciones."
            : "Ese horario no coincide con ninguno de los ofrecidos. Volve a ofrecer con agenda_ver_horarios.",
      };
    }
    intervalo = servicio?.duracionMin ? { inicio: elegido.inicio, fin: new Date(elegido.inicio.getTime() + servicio.duracionMin * 60_000) } : elegido;
  } else {
    const inicio = input.inicio instanceof Date ? input.inicio : new Date(input.inicio);
    intervalo = { inicio, fin: new Date(inicio.getTime() + (servicio?.duracionMin ?? a.duracionMin) * 60_000) };
  }

  // Garantia 2: sigue libre.
  const choques = await ocupados(a, intervalo.inicio, intervalo.fin);
  if (choques.some((o) => o.inicio < intervalo.fin && intervalo.inicio < o.fin)) {
    return { ok: false, motivo: "Ese horario se acaba de ocupar. Ofrece otros con agenda_ver_horarios." };
  }

  const [contacto] = await db.select({ name: contacts.name, email: contacts.email, phone: contacts.phone }).from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  const email = input.email?.trim() || contacto?.email || null;
  const titulo = `${servicio?.nombre ?? a.titulo} · ${contacto?.name ?? "Cliente"}`;
  const descripcion = [a.descripcion, contacto?.phone ? `Telefono: ${contacto.phone}` : null, input.notas ? `Notas: ${input.notas}` : null]
    .filter(Boolean)
    .join("\n");

  // Con sena, el evento de Google se crea al acreditarse el pago (turnos.ts), no antes.
  const conSena = senaCentavos !== null;

  // Garantia 3: si Google esta conectado y falla, no hay cita.
  let evento: { id: string; meet: string | null; link: string | null } | null = null;
  const token = tokenGoogle(a);
  if (token && !conSena) {
    try {
      evento = await crearEvento(token, a.googleCalendarId, { ...intervalo, zona: z, titulo, descripcion, email });
    } catch (err) {
      console.error("[agenda] no se pudo crear el evento en Google:", err instanceof Error ? err.message : err);
      return { ok: false, motivo: "No se pudo crear el evento en el calendario. No confirmes la cita: deriva a una persona." };
    }
  }

  const [cita] = await db
    .insert(agendaCitas)
    .values({
      contactId: input.contactId,
      conversationId: input.conversationId,
      inicio: intervalo.inicio,
      fin: intervalo.fin,
      titulo,
      emailInvitado: email,
      notas: input.notas ?? null,
      origen: input.origen ?? "agente",
      googleEventId: evento?.id ?? null,
      meetLink: evento?.meet ?? null,
      googleLink: evento?.link ?? null,
      servicio: servicio?.nombre ?? null,
      precioCentavos: servicio?.precioCentavos ?? null,
      senaCentavos,
      estado: conSena ? "pendiente_sena" : "agendada",
      senaVenceAt: conSena ? new Date(Date.now() + a.senaPlazoMin * 60_000) : null,
    })
    .returning({ id: agendaCitas.id });

  let pendienteSena: NonNullable<Extract<ResultadoAgendar, { ok: true }>["cita"]["pendienteSena"]> | undefined;
  if (conSena && servicio) {
    try {
      const cobro = await proveedorPago(a.proveedorPago).crearCobro({
        citaId: cita.id,
        montoCentavos: senaCentavos,
        moneda: getConfig().moneda,
        descripcion: `Sena ${servicio.nombre}`,
      });
      await db.update(agendaCitas).set({ pagoReferencia: cobro.referencia }).where(eq(agendaCitas.id, cita.id));
      pendienteSena = { montoCentavos: senaCentavos, linkPago: cobro.url, venceEnMin: a.senaPlazoMin, servicio: servicio.nombre };
    } catch (err) {
      // Sin link de pago no hay reserva: se borra para no bloquear el horario.
      await db.delete(agendaCitas).where(eq(agendaCitas.id, cita.id));
      console.error("[agenda] no se pudo crear el cobro:", err instanceof Error ? err.message : err);
      return { ok: false, motivo: "No se pudo generar el link de pago. No confirmes nada: deriva a una persona." };
    }
    await moverEtapaPorClave(input.contactId, ETAPA_SENA_PENDIENTE, { valorCentavos: servicio.precioCentavos, motivo: `Reserva de ${servicio.nombre}, espera la sena` });
  }

  if (input.email && !contacto?.email) {
    await db.update(contacts).set({ email: input.email.trim(), updatedAt: new Date() }).where(eq(contacts.id, input.contactId));
  }
  if (input.conversationId) await db.delete(agendaOfrecidos).where(eq(agendaOfrecidos.conversationId, input.conversationId));

  const etiqueta = etiquetaHorario(intervalo.inicio, z);
  await db.insert(activities).values({
    type: "meeting",
    description: `${input.origen === "persona" ? "Cita agendada" : "El agente agendo"}${servicio ? ` ${servicio.nombre}` : ""}: ${etiqueta}${
      evento?.meet ? ` (${evento.meet})` : ""
    }${conSena ? " · espera la sena" : ""}`,
    contactId: input.contactId,
  });

  return { ok: true, cita: { id: cita.id, etiqueta, meet: evento?.meet ?? null, invitacionEnviada: Boolean(evento && email), pendienteSena } };
}

export async function cancelar(citaId: string) {
  const [c] = await db.select().from(agendaCitas).where(eq(agendaCitas.id, citaId)).limit(1);
  if (!c) return false;
  const a = await leerAjustes();
  const token = tokenGoogle(a);
  if (token && c.googleEventId) {
    try {
      await cancelarEvento(token, a.googleCalendarId, c.googleEventId);
    } catch (err) {
      console.error("[agenda] no se pudo borrar el evento en Google:", err instanceof Error ? err.message : err);
    }
  }
  await db.update(agendaCitas).set({ estado: "cancelada", updatedAt: new Date() }).where(eq(agendaCitas.id, citaId));
  return true;
}

export async function citasDe(filtroContactos?: string[] | null) {
  const filas = await db
    .select({
      id: agendaCitas.id,
      contactId: agendaCitas.contactId,
      conversationId: agendaCitas.conversationId,
      inicio: agendaCitas.inicio,
      fin: agendaCitas.fin,
      estado: agendaCitas.estado,
      titulo: agendaCitas.titulo,
      emailInvitado: agendaCitas.emailInvitado,
      notas: agendaCitas.notas,
      origen: agendaCitas.origen,
      meetLink: agendaCitas.meetLink,
      googleLink: agendaCitas.googleLink,
      servicio: agendaCitas.servicio,
      precioCentavos: agendaCitas.precioCentavos,
      senaCentavos: agendaCitas.senaCentavos,
      senaVenceAt: agendaCitas.senaVenceAt,
      senaPagadaAt: agendaCitas.senaPagadaAt,
      recordatorioEnviadoAt: agendaCitas.recordatorioEnviadoAt,
      confirmadaPorClienteAt: agendaCitas.confirmadaPorClienteAt,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      ownerId: contacts.ownerId,
    })
    .from(agendaCitas)
    .leftJoin(contacts, eq(contacts.id, agendaCitas.contactId))
    .orderBy(desc(agendaCitas.inicio))
    .limit(300);
  return filtroContactos ? filas.filter((f) => filtroContactos.includes(f.contactId)) : filas;
}
