import "server-only";
import { and, eq, gte, lte, ne, desc } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { cifradoActivo, cifrar, descifrar } from "@/lib/cifrado";
import { agendaAjustes, agendaCitas, agendaOfrecidos } from "../tabla";
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

export async function guardarAjustes(cambios: Partial<Pick<Ajustes, "dias" | "desde" | "hasta" | "duracionMin" | "anticipacionMin" | "diasAdelante" | "titulo" | "descripcion">>) {
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

function tokenGoogle(a: Ajustes): string | null {
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

async function ocupados(a: Ajustes, desde: Date, hasta: Date): Promise<Intervalo[]> {
  const propias = await db
    .select({ inicio: agendaCitas.inicio, fin: agendaCitas.fin })
    .from(agendaCitas)
    .where(and(ne(agendaCitas.estado, "cancelada"), gte(agendaCitas.fin, desde), lte(agendaCitas.inicio, hasta)));
  const token = tokenGoogle(a);
  const enGoogle = token ? await ocupadoEnGoogle(token, a.googleCalendarId, desde, hasta) : [];
  return [...propias, ...enGoogle];
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
  | { ok: true; cita: { id: string; etiqueta: string; meet: string | null; invitacionEnviada: boolean } }
  | { ok: false; motivo: string };

export async function agendar(input: {
  contactId: string;
  conversationId: string | null;
  /** Persona: el instante elegido. Agente: el horario como lo ofrecio (texto o ISO). */
  inicio: Date | string;
  email?: string | null;
  notas?: string | null;
  origen?: "agente" | "persona";
}): Promise<ResultadoAgendar> {
  const a = await leerAjustes();
  const z = zona();
  let intervalo: Intervalo;

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
    intervalo = elegido;
  } else {
    const inicio = input.inicio instanceof Date ? input.inicio : new Date(input.inicio);
    intervalo = { inicio, fin: new Date(inicio.getTime() + a.duracionMin * 60_000) };
  }

  // Garantia 2: sigue libre.
  const choques = await ocupados(a, intervalo.inicio, intervalo.fin);
  if (choques.some((o) => o.inicio < intervalo.fin && intervalo.inicio < o.fin)) {
    return { ok: false, motivo: "Ese horario se acaba de ocupar. Ofrece otros con agenda_ver_horarios." };
  }

  const [contacto] = await db.select({ name: contacts.name, email: contacts.email, phone: contacts.phone }).from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  const email = input.email?.trim() || contacto?.email || null;
  const titulo = `${a.titulo} · ${contacto?.name ?? "Cliente"}`;
  const descripcion = [a.descripcion, contacto?.phone ? `Telefono: ${contacto.phone}` : null, input.notas ? `Notas: ${input.notas}` : null]
    .filter(Boolean)
    .join("\n");

  // Garantia 3: si Google esta conectado y falla, no hay cita.
  let evento: { id: string; meet: string | null; link: string | null } | null = null;
  const token = tokenGoogle(a);
  if (token) {
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
    })
    .returning({ id: agendaCitas.id });

  if (input.email && !contacto?.email) {
    await db.update(contacts).set({ email: input.email.trim(), updatedAt: new Date() }).where(eq(contacts.id, input.contactId));
  }
  if (input.conversationId) await db.delete(agendaOfrecidos).where(eq(agendaOfrecidos.conversationId, input.conversationId));

  const etiqueta = etiquetaHorario(intervalo.inicio, z);
  await db.insert(activities).values({
    type: "meeting",
    description: `${input.origen === "persona" ? "Cita agendada" : "El agente agendo"}: ${etiqueta}${evento?.meet ? ` (${evento.meet})` : ""}`,
    contactId: input.contactId,
  });

  return { ok: true, cita: { id: cita.id, etiqueta, meet: evento?.meet ?? null, invitacionEnviada: Boolean(evento && email) } };
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
