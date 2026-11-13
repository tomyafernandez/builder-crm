import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { contacts, conversations } from "@/db/schema";

/** Espejo tipado de migrations/0000_agenda.sql + 0001_sena_y_recordatorios.sql. */

/** Un servicio que se agenda (precio en centavos de la moneda de la config). */
export interface ServicioAgenda {
  nombre: string;
  precioCentavos: number;
  duracionMin?: number;
}

/** Citas agendadas (por el agente o a mano). */
export const agendaCitas = pgTable("agenda_citas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fin: timestamp("fin", { withTimezone: true }).notNull(),
  /**
   * agendada (sin sena) | pendiente_sena | confirmada | vencida | cancelada | asistio |
   * ausente | realizada (viejo). Ver lib/sena.ts.
   */
  estado: text("estado").notNull().default("agendada"),
  titulo: text("titulo").notNull(),
  emailInvitado: text("email_invitado"),
  notas: text("notas"),
  /** agente | persona */
  origen: text("origen").notNull().default("agente"),
  googleEventId: text("google_event_id"),
  meetLink: text("meet_link"),
  googleLink: text("google_link"),
  servicio: text("servicio"),
  precioCentavos: integer("precio_centavos"),
  senaCentavos: integer("sena_centavos"),
  senaVenceAt: timestamp("sena_vence_at", { withTimezone: true }),
  senaPagadaAt: timestamp("sena_pagada_at", { withTimezone: true }),
  pagoReferencia: text("pago_referencia"),
  recordatorioEnviadoAt: timestamp("recordatorio_enviado_at", { withTimezone: true }),
  confirmadaPorClienteAt: timestamp("confirmada_por_cliente_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Lo que el agente le OFRECIO a cada conversacion. Solo se puede reservar un horario
 * ofrecido: el agente no puede inventar una hora (idea de Vocero CRM).
 */
export const agendaOfrecidos = pgTable("agenda_ofrecidos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fin: timestamp("fin", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Una sola fila (id = 'default'): horarios de atencion y conexion con Google. */
export const agendaAjustes = pgTable("agenda_ajustes", {
  id: text("id").primaryKey().default("default"),
  /** Dias habiles, 0 = domingo ... 6 = sabado. */
  dias: jsonb("dias").$type<number[]>().notNull(),
  desde: text("desde").notNull(),
  hasta: text("hasta").notNull(),
  duracionMin: integer("duracion_min").notNull(),
  anticipacionMin: integer("anticipacion_min").notNull(),
  diasAdelante: integer("dias_adelante").notNull(),
  titulo: text("titulo").notNull(),
  descripcion: text("descripcion"),
  googleEmail: text("google_email"),
  /** Cifrado con cifrar() (spec nucleo/12). Nunca sale al navegador. */
  googleRefreshToken: text("google_refresh_token"),
  googleCalendarId: text("google_calendar_id").notNull().default("primary"),
  servicios: jsonb("servicios").$type<ServicioAgenda[]>().notNull().default([]),
  /** null = sin sena. */
  senaPorcentaje: integer("sena_porcentaje"),
  senaPlazoMin: integer("sena_plazo_min").notNull().default(60),
  recordatorioActivo: boolean("recordatorio_activo").notNull().default(false),
  recordatorioHorasAntes: integer("recordatorio_horas_antes").notNull().default(24),
  /** Plantilla aprobada de WhatsApp para recordar fuera de la ventana de 24 h. */
  recordatorioPlantilla: text("recordatorio_plantilla"),
  /** simulado | mercadopago */
  proveedorPago: text("proveedor_pago").notNull().default("simulado"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
