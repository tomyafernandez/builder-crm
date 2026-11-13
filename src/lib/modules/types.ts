import type { NextRequest } from "next/server";
import type { ReactNode, ComponentType } from "react";
import type OpenAI from "openai";
import type { TeamMember } from "@/lib/team";
import type { esquemaCampo } from "@/lib/config/schema";
import type { z } from "zod";
import type { ToolContext, ToolResult } from "@/lib/agent/tools";

/**
 * Contrato publico de un modulo (`modules/<nombre>/`). Es la interfaz entre la zona
 * del cliente y el nucleo: cambiarla es un cambio mayor de version.
 *
 * Dos archivos por modulo:
 *  - `manifiesto.ts`  -> ManifiestoModulo. Seguro para el navegador (lo importa el
 *                        sidebar): nada de base de datos ni secretos.
 *  - `servidor.ts`    -> ModuloServidor. Paginas, API, tools del agente y seed.
 */

export type SeccionNav = "Operaciones" | "Productividad" | "Inteligencia";

export interface ItemNavModulo {
  /** Ruta relativa a /m/<modulo>. "" es la pagina principal del modulo. */
  ruta?: string;
  etiqueta: string;
  /** Un icono de lucide-react (el modulo lo importa). */
  icono: ComponentType<{ className?: string }>;
  seccion?: SeccionNav;
}

export interface ManifiestoModulo {
  /** Igual al nombre de la carpeta (snake_case). */
  nombre: string;
  titulo: string;
  descripcion?: string;
  version: string;
  /** Entradas del menu lateral. Sin `nav`, el modulo no aparece en el menu. */
  nav?: ItemNavModulo[];
  /** Campos de contacto que aporta (se suman a config/cliente.ts). Misma forma que alli. */
  campos?: z.input<typeof esquemaCampo>[];
}

export interface PropsPaginaModulo {
  /** Segmentos capturados del patron, ej. { id: "abc" } para "[id]". */
  params: Record<string, string>;
  searchParams: Record<string, string | string[] | undefined>;
  /** Miembro de la sesion: ya pasado por requireMember. */
  member: TeamMember;
}

export type PaginaModulo = ComponentType<PropsPaginaModulo> | ((props: PropsPaginaModulo) => ReactNode | Promise<ReactNode>);

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ContextoApiModulo {
  params: Record<string, string>;
  member: TeamMember;
}

export type HandlerModulo = (request: NextRequest, ctx: ContextoApiModulo) => Promise<Response> | Response;

export interface ToolModulo {
  /** Definicion para el modelo (OpenAI tool calling). El nombre debe ser unico. */
  definicion: OpenAI.Chat.Completions.ChatCompletionFunctionTool;
  /** Texto para Ajustes -> Agente IA. */
  descripcionUI: string;
  ejecutar: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ModuloServidor {
  manifiesto: ManifiestoModulo;
  /**
   * Paginas por patron de ruta relativa: "" (principal), "nueva", "[id]", "[id]/editar".
   * Un segmento entre corchetes captura y llega en `params`.
   */
  paginas?: Record<string, PaginaModulo>;
  /** Handlers por patron y metodo. Ya protegidos por requireMember. */
  api?: Record<string, Partial<Record<MetodoHttp, HandlerModulo>>>;
  /** Tools que el agente puede usar mientras el modulo esta activo. */
  tools?: ToolModulo[];
  /** Datos de demostracion del modulo (`npm run seed`). Debe ser idempotente. */
  seed?: () => Promise<void>;
  /**
   * Paginas SIN login, servidas en /m/<modulo>/publico/<patron> (spec nucleo/19). Para lo
   * que ve un cliente final (ej. la pagina de pago de una sena). Cada una valida por su
   * cuenta lo que muestra: no hay miembro.
   */
  paginasPublicas?: Record<string, ComponentType<PropsPaginaPublica> | ((props: PropsPaginaPublica) => ReactNode | Promise<ReactNode>)>;
  /** API SIN login en /api/m/<modulo>/publico/<patron>. */
  apiPublica?: Record<string, Partial<Record<MetodoHttp, HandlerPublico>>>;
  /**
   * Trabajo periodico del modulo (recordatorios, vencimientos). Lo corren el barrido del
   * proceso (Coolify), GET /api/modulos/barridos (cron) y los botones de prueba.
   */
  barrido?: (opciones: OpcionesBarrido) => Promise<ResultadoBarrido>;
  /** Lineas que el modulo aporta a la tarjeta "Lo que te dejo el sistema". */
  metricasPanel?: (dias: number, contexto: ContextoMetricas) => Promise<MetricaRetorno[]>;
}

export interface PropsPaginaPublica {
  params: Record<string, string>;
  searchParams: Record<string, string | string[] | undefined>;
}

export type HandlerPublico = (request: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response> | Response;

export interface OpcionesBarrido {
  /**
   * Solo contactos creados desde /simulador (no los datos demo ni clientes reales). Lo
   * usan los botones "probar ahora".
   */
  soloSimulador?: boolean;
  /** No esperar los plazos. Solo tiene efecto junto con `soloSimulador`. */
  ignorarEspera?: boolean;
}

export interface ResultadoBarrido {
  revisadas: number;
  enviados: number;
  errores: number;
  detalle: Array<{ contacto: string | null; resultado: string }>;
}

export interface ContextoMetricas {
  /** Supuestos de config.retorno. */
  retorno: { minutosPorMensaje: number; tasaAusencia: number };
  /** Conversaciones que volvieron a escribir despues de un seguimiento (las mide el nucleo). */
  conversacionesRecuperadas: string[];
}

export interface MetricaRetorno {
  clave: string;
  etiqueta: string;
  /** Monto en centavos (moneda de la config) o null si la linea no es plata. */
  montoCentavos: number | null;
  /** Texto del valor si no es plata (ej. "42 h"). */
  valorTexto?: string;
  /** La cuenta a la vista: "12 turnos x USD 80". */
  cuenta: string;
  estimado?: boolean;
  /** false: se muestra pero no suma al total (ej. senas: plata del mismo turno). */
  sumaAlTotal?: boolean;
}
