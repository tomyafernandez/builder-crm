import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

/**
 * Espejo MINIMO de las tablas de la agenda que este seed escribe. Un modulo no importa
 * otro modulo (modules/README.md, regla 3): las columnas se declaran de nuevo aca. Si la
 * agenda cambia sus tablas, este espejo se ajusta (solo lo usa la demo).
 */
export const citas = pgTable("agenda_citas", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  conversationId: text("conversation_id"),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fin: timestamp("fin", { withTimezone: true }).notNull(),
  estado: text("estado").notNull(),
  titulo: text("titulo").notNull(),
  origen: text("origen").notNull(),
  servicio: text("servicio"),
  precioCentavos: integer("precio_centavos"),
  senaCentavos: integer("sena_centavos"),
  senaVenceAt: timestamp("sena_vence_at", { withTimezone: true }),
  senaPagadaAt: timestamp("sena_pagada_at", { withTimezone: true }),
  pagoReferencia: text("pago_referencia"),
  recordatorioEnviadoAt: timestamp("recordatorio_enviado_at", { withTimezone: true }),
  confirmadaPorClienteAt: timestamp("confirmada_por_cliente_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const ajustes = pgTable("agenda_ajustes", {
  id: text("id").primaryKey(),
  dias: jsonb("dias").notNull(),
  desde: text("desde").notNull(),
  hasta: text("hasta").notNull(),
  duracionMin: integer("duracion_min").notNull(),
  anticipacionMin: integer("anticipacion_min").notNull(),
  diasAdelante: integer("dias_adelante").notNull(),
  titulo: text("titulo").notNull(),
  descripcion: text("descripcion"),
  servicios: jsonb("servicios").notNull(),
  senaPorcentaje: integer("sena_porcentaje"),
  senaPlazoMin: integer("sena_plazo_min").notNull(),
  recordatorioActivo: boolean("recordatorio_activo").notNull(),
  recordatorioHorasAntes: integer("recordatorio_horas_antes").notNull(),
  proveedorPago: text("proveedor_pago").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
