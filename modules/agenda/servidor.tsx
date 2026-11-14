import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { HandlerModulo, ModuloServidor } from "@/lib/modules/types";
import { canAccessContactId } from "@/lib/team";
import { cifradoActivo } from "@/lib/cifrado";
import manifiesto from "./manifiesto";
import { AgendaPage } from "./componentes/AgendaPage";
import { PaginaPago } from "./componentes/PaginaPago";
import { formatCurrency } from "@/lib/constants";
import type { ServicioAgenda } from "./tabla";
import { barridoAgenda } from "./lib/barrido";
import { metricasAgenda } from "./lib/metricas";
import { confirmarAsistencia, confirmarPago, misTurnos, reprogramar } from "./lib/turnos";
import { canjearCodigo, googleConfigurado, nombreCalendario, urlAutorizacion, urlRetorno } from "./lib/google";
import {
  agendar,
  cancelar,
  citasDe,
  desconectarGoogle,
  guardarAjustes,
  guardarConexionGoogle,
  leerAjustes,
  ofrecerHorarios,
  serviciosParaAgente,
  tokenGoogle,
  zona,
} from "./lib/servicio";

const COOKIE_ESTADO = "agenda_oauth_estado";
const soloAdmin = () => NextResponse.json({ error: "Solo un administrador" }, { status: 403 });

/** Panel: ajustes (sin el token), estado de Google y citas visibles para el miembro. */
const panel: HandlerModulo = async (_req, { member }) => {
  const a = await leerAjustes();
  const citas = await citasDe();
  return NextResponse.json({
    ajustes: {
      dias: a.dias,
      desde: a.desde,
      hasta: a.hasta,
      duracionMin: a.duracionMin,
      anticipacionMin: a.anticipacionMin,
      diasAdelante: a.diasAdelante,
      titulo: a.titulo,
      descripcion: a.descripcion,
      servicios: a.servicios ?? [],
      senaPorcentaje: a.senaPorcentaje,
      senaPlazoMin: a.senaPlazoMin,
      recordatorioActivo: a.recordatorioActivo,
      recordatorioHorasAntes: a.recordatorioHorasAntes,
      recordatorioPlantilla: a.recordatorioPlantilla,
      proveedorPago: a.proveedorPago,
    },
    zona: zona(),
    google: {
      configurado: googleConfigurado(),
      conectado: Boolean(a.googleRefreshToken),
      // El nombre del calendario y no el correo de la cuenta: la pantalla se muestra en
      // demos y grabaciones.
      calendario: await (async () => {
        const token = tokenGoogle(a);
        if (!token) return null;
        return a.googleCalendarId === "primary" ? "tu calendario principal" : await nombreCalendario(token, a.googleCalendarId);
      })(),
      cifrado: cifradoActivo(),
    },
    esAdmin: member.role === "admin",
    citas: member.role === "admin" ? citas : citas.filter((c) => c.ownerId === member.id),
  });
};

const guardar: HandlerModulo = async (req, { member }) => {
  if (member.role !== "admin") return soloAdmin();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  const dias = Array.isArray(b.dias) ? b.dias.map(Number).filter((d) => d >= 0 && d <= 6) : undefined;
  const desde = typeof b.desde === "string" && hora.test(b.desde) ? b.desde : undefined;
  const hasta = typeof b.hasta === "string" && hora.test(b.hasta) ? b.hasta : undefined;
  if (desde && hasta && desde >= hasta) {
    return NextResponse.json({ error: "El horario de inicio tiene que ser antes del de fin" }, { status: 400 });
  }
  const num = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
  };
  const a = await guardarAjustes({
    dias,
    desde,
    hasta,
    duracionMin: num(b.duracionMin, 10, 240),
    anticipacionMin: num(b.anticipacionMin, 0, 7 * 24 * 60),
    diasAdelante: num(b.diasAdelante, 1, 60),
    titulo: typeof b.titulo === "string" && b.titulo.trim() ? b.titulo.trim().slice(0, 120) : undefined,
    descripcion: typeof b.descripcion === "string" ? b.descripcion.slice(0, 1000) : undefined,
    servicios: Array.isArray(b.servicios) ? leerServicios(b.servicios) : undefined,
    senaPorcentaje: b.senaPorcentaje === null || b.senaPorcentaje === "" ? null : num(b.senaPorcentaje, 1, 100),
    senaPlazoMin: num(b.senaPlazoMin, 10, 24 * 60),
    recordatorioActivo: typeof b.recordatorioActivo === "boolean" ? b.recordatorioActivo : undefined,
    recordatorioHorasAntes: num(b.recordatorioHorasAntes, 1, 72),
    recordatorioPlantilla:
      typeof b.recordatorioPlantilla === "string" ? b.recordatorioPlantilla.trim().slice(0, 120) || null : b.recordatorioPlantilla === null ? null : undefined,
    proveedorPago: b.proveedorPago === "simulado" || b.proveedorPago === "mercadopago" ? b.proveedorPago : undefined,
  });
  return NextResponse.json({ ok: true, titulo: a.titulo });
};

/** Servicios del formulario: nombre, precio en centavos y duracion opcional. */
function leerServicios(lista: unknown[]): ServicioAgenda[] {
  return lista
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      nombre: typeof x.nombre === "string" ? x.nombre.trim().slice(0, 80) : "",
      precioCentavos: Math.max(0, Math.round(Number(x.precioCentavos) || 0)),
      duracionMin: Number(x.duracionMin) >= 10 && Number(x.duracionMin) <= 480 ? Math.round(Number(x.duracionMin)) : undefined,
    }))
    .filter((x) => x.nombre)
    .slice(0, 30);
}

/**
 * Botones "Probar recordatorios ahora" y "Vencer reservas ahora": solo contactos creados
 * desde el Simulador y sin esperar los plazos (spec nucleo/19, D5).
 */
const probar: HandlerModulo = async (req, { member }) => {
  if (member.role !== "admin") return soloAdmin();
  const b = (await req.json().catch(() => ({}))) as { accion?: string };
  const que = b.accion === "vencer" ? { vencer: true, recordar: false } : { vencer: false, recordar: true };
  const r = await barridoAgenda({ soloSimulador: true, ignorarEspera: true }, que);
  return NextResponse.json(r);
};

/** El cliente toca "Pagar" en la pagina de prueba. Sin sesion: lo identifica el id. */
const pagar = async (_req: Request, { params }: { params: Record<string, string> }) => {
  const r = await confirmarPago(params.id ?? "");
  if (!r.ok) {
    const textos: Record<string, string> = {
      no_encontrada: "No encontramos esta reserva",
      vencida: "La reserva vencio: se libero el horario",
      cancelada: "La reserva fue cancelada",
      sin_sena: "Esta reserva no tiene sena para pagar",
    };
    return NextResponse.json({ error: textos[r.motivo] }, { status: r.motivo === "no_encontrada" ? 404 : 409 });
  }
  return NextResponse.json(r);
};

const conectar: HandlerModulo = async (req, { member }) => {
  if (member.role !== "admin") return soloAdmin();
  if (!googleConfigurado()) {
    return NextResponse.json({ error: "Faltan GOOGLE_CALENDAR_CLIENT_ID y GOOGLE_CALENDAR_CLIENT_SECRET" }, { status: 409 });
  }
  if (!cifradoActivo()) {
    return NextResponse.json({ error: "Falta ENCRYPTION_KEY: el acceso a Google se guarda cifrado" }, { status: 409 });
  }
  const estado = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(urlAutorizacion(urlRetorno(new URL(req.url).origin), estado));
  res.cookies.set(COOKIE_ESTADO, estado, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
};

const retorno: HandlerModulo = async (req, { member }) => {
  const url = new URL(req.url);
  const volver = (q: string) => {
    const r = NextResponse.redirect(new URL(`/m/agenda?google=${q}`, url.origin));
    r.cookies.delete(COOKIE_ESTADO);
    return r;
  };
  if (member.role !== "admin") return volver("solo_admin");
  const estado = url.searchParams.get("state");
  if (!estado || estado !== req.cookies.get(COOKIE_ESTADO)?.value) return volver("estado_invalido");
  if (url.searchParams.get("error")) return volver("cancelado");
  const code = url.searchParams.get("code");
  if (!code) return volver("sin_codigo");
  try {
    const { refreshToken, email } = await canjearCodigo(code, urlRetorno(url.origin));
    await guardarConexionGoogle(refreshToken, email);
    return volver("ok");
  } catch (err) {
    console.error("[agenda] fallo la conexion con Google:", err instanceof Error ? err.message : err);
    return volver("error");
  }
};

const desconectar: HandlerModulo = async (_req, { member }) => {
  if (member.role !== "admin") return soloAdmin();
  await desconectarGoogle();
  return NextResponse.json({ ok: true });
};

/** Agendar a mano desde el CRM (una persona elige fecha y hora). */
const crearCita: HandlerModulo = async (req, { member }) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const contactId = typeof b?.contactId === "string" ? b.contactId : "";
  const inicio = typeof b?.inicio === "string" ? new Date(b.inicio) : null;
  if (!contactId || !inicio || Number.isNaN(inicio.getTime())) {
    return NextResponse.json({ error: "contactId e inicio son requeridos" }, { status: 400 });
  }
  if (!(await canAccessContactId(member, contactId))) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  const r = await agendar({
    contactId,
    conversationId: null,
    inicio,
    email: typeof b?.email === "string" ? b.email : null,
    notas: typeof b?.notas === "string" ? b.notas : null,
    origen: "persona",
  });
  return NextResponse.json(r, { status: r.ok ? 201 : 409 });
};

const cancelarCita: HandlerModulo = async (_req, { member, params }) => {
  const citas = await citasDe();
  const c = citas.find((x) => x.id === params.id);
  if (!c || !(await canAccessContactId(member, c.contactId))) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }
  await cancelar(params.id);
  return NextResponse.json({ ok: true });
};

const modulo: ModuloServidor = {
  manifiesto,

  paginas: {
    "": () => <AgendaPage />,
  },

  api: {
    "": { GET: panel, PUT: guardar },
    citas: { POST: crearCita },
    "citas/[id]/cancelar": { POST: cancelarCita },
    "google/conectar": { GET: conectar },
    "google/callback": { GET: retorno },
    "google/desconectar": { POST: desconectar },
    probar: { POST: probar },
  },

  paginasPublicas: {
    "pago/[id]": PaginaPago,
  },

  apiPublica: {
    "pago/[id]": { POST: pagar },
  },

  barrido: (opciones) => barridoAgenda(opciones),

  metricasPanel: (dias, contexto) => metricasAgenda(dias, contexto),

  tools: [
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_ver_horarios",
          description:
            "Devuelve los proximos horarios LIBRES reales para una llamada o cita (hasta 4) y, si hay, los servicios con su precio y su sena. Usala antes de proponer horarios; nunca inventes una hora ni un precio. Ofrece al cliente 2 o 3 de estas opciones con su etiqueta.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      },
      descripcionUI: "Consultar horarios libres de la agenda (y de Google Calendar si esta conectado).",
      async ejecutar(_args, ctx) {
        const opciones = await ofrecerHorarios(ctx.conversationId ?? null);
        const servicios = serviciosParaAgente(await leerAjustes(), formatCurrency);
        if (opciones.length === 0) {
          return { ok: true, data: { opciones: [], servicios, mensaje: "No hay horarios libres en los proximos dias: deriva a una persona." } };
        }
        return { ok: true, data: servicios.length ? { opciones, servicios } : { opciones } };
      },
    },
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_agendar",
          description:
            "Agenda la llamada o cita en UNO de los horarios que ofreciste con agenda_ver_horarios, cuando el cliente ya eligio. Solo confirma al cliente si esta herramienta devuelve ok. Si hay servicios, pasa el servicio elegido. Si devuelve una sena pendiente, el turno NO esta confirmado: mandale el link de pago y el plazo. Si tenes su email, pasalo para que le llegue la invitacion.",
          parameters: {
            type: "object",
            properties: {
              horario: {
                type: "string",
                description: "El horario elegido tal como lo ofreciste, con dia y hora (ej. 'lunes 9 de noviembre, 10:30'), o el valor 'inicio' de la opcion.",
              },
              servicio: { type: "string", description: "Nombre del servicio elegido, tal como lo devolvio agenda_ver_horarios (si hay servicios)." },
              email: { type: "string", description: "Email del cliente para la invitacion (opcional)." },
              notas: { type: "string", description: "Contexto breve para quien atiende la llamada." },
            },
            required: ["horario"],
            additionalProperties: false,
          },
        },
      },
      descripcionUI: "Agendar la llamada o cita en un horario ofrecido (crea el evento con Meet si Google esta conectado).",
      async ejecutar(args, ctx) {
        const horario = String(args.horario ?? args.inicio ?? "").trim();
        if (!horario) return { ok: false, error: "falta el horario elegido" };
        const email = typeof args.email === "string" && /\S+@\S+\.\S+/.test(args.email) ? args.email : null;
        const r = await agendar({
          contactId: ctx.contactId,
          conversationId: ctx.conversationId ?? null,
          inicio: horario,
          email,
          notas: typeof args.notas === "string" ? args.notas.slice(0, 500) : null,
          servicio: typeof args.servicio === "string" ? args.servicio : null,
        });
        if (!r.ok) return { ok: false, error: r.motivo };
        const p = r.cita.pendienteSena;
        if (p) {
          return {
            ok: true,
            data: {
              confirmada: false,
              reservada: true,
              cuando: r.cita.etiqueta,
              servicio: p.servicio,
              sena: formatCurrency(p.montoCentavos),
              linkPago: p.linkPago,
              plazo: p.venceEnMin >= 60 ? `${Math.round(p.venceEnMin / 60)} hora${p.venceEnMin >= 120 ? "s" : ""}` : `${p.venceEnMin} minutos`,
              nota: "Mandale el link de pago tal cual, con el monto de la sena y el plazo. Aclarale que el turno queda confirmado cuando se acredita la sena; si no se paga a tiempo se libera el horario. No digas que ya esta confirmado.",
            },
          };
        }
        return {
          ok: true,
          data: {
            confirmada: true,
            cuando: r.cita.etiqueta,
            linkMeet: r.cita.meet,
            invitacionPorEmail: r.cita.invitacionEnviada,
            nota: r.cita.meet
              ? "Comparti el dia, la hora y el link de Meet."
              : "Comparti el dia y la hora; el link de la llamada se lo pasa el equipo.",
          },
        };
      },
    },
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_mis_turnos",
          description: "Devuelve los proximos turnos de este cliente (dia y hora, servicio, si espera la sena). Usala cuando pregunte por su turno o quiera confirmarlo o cambiarlo.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      },
      descripcionUI: "Ver los proximos turnos del cliente.",
      async ejecutar(_args, ctx) {
        const turnos = await misTurnos(ctx.contactId);
        return { ok: true, data: turnos.length ? { turnos } : { turnos: [], mensaje: "No tiene turnos proximos." } };
      },
    },
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_confirmar_asistencia",
          description: "Registra que el cliente confirmo que viene a su turno (por ejemplo cuando responde que si al recordatorio). Sin turno, toma el proximo.",
          parameters: {
            type: "object",
            properties: { turno: { type: "string", description: "id del turno de agenda_mis_turnos (opcional)." } },
            additionalProperties: false,
          },
        },
      },
      descripcionUI: "Marcar que el cliente confirmo su asistencia al turno.",
      async ejecutar(args, ctx) {
        const r = await confirmarAsistencia(ctx.contactId, typeof args.turno === "string" ? args.turno : null);
        return r.ok ? { ok: true, data: { confirmado: true, cuando: r.cuando } } : { ok: false, error: r.motivo };
      },
    },
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_reprogramar",
          description:
            "Cambia el turno del cliente a UNO de los horarios que le ofreciste con agenda_ver_horarios. Conserva la sena pagada y mueve el evento del calendario. Solo confirma el cambio si devuelve ok.",
          parameters: {
            type: "object",
            properties: {
              horario: { type: "string", description: "El horario nuevo tal como lo ofreciste (ej. 'viernes 14 de noviembre, 11:00')." },
              turno: { type: "string", description: "id del turno a cambiar (de agenda_mis_turnos). Sin id, el proximo." },
            },
            required: ["horario"],
            additionalProperties: false,
          },
        },
      },
      descripcionUI: "Reprogramar el turno del cliente a un horario ofrecido (conserva la sena y mueve el evento).",
      async ejecutar(args, ctx) {
        const r = await reprogramar({
          contactId: ctx.contactId,
          conversationId: ctx.conversationId ?? null,
          horario: String(args.horario ?? "").trim(),
          turno: typeof args.turno === "string" ? args.turno : null,
        });
        if (!r.ok) return { ok: false, error: r.motivo };
        return {
          ok: true,
          data: {
            reprogramado: true,
            antes: r.antes,
            cuando: r.cuando,
            nota: r.esperaSena ? "El turno sigue esperando la sena." : r.conservaSena ? "La sena pagada queda para el turno nuevo." : undefined,
          },
        };
      },
    },
  ],
};

export default modulo;
