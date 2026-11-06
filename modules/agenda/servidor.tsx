import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { HandlerModulo, ModuloServidor } from "@/lib/modules/types";
import { canAccessContactId } from "@/lib/team";
import { cifradoActivo } from "@/lib/cifrado";
import manifiesto from "./manifiesto";
import { AgendaPage } from "./componentes/AgendaPage";
import { canjearCodigo, googleConfigurado, urlAutorizacion, urlRetorno } from "./lib/google";
import {
  agendar,
  cancelar,
  citasDe,
  desconectarGoogle,
  guardarAjustes,
  guardarConexionGoogle,
  leerAjustes,
  ofrecerHorarios,
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
    },
    zona: zona(),
    google: {
      configurado: googleConfigurado(),
      conectado: Boolean(a.googleRefreshToken),
      email: a.googleEmail,
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
  });
  return NextResponse.json({ ok: true, titulo: a.titulo });
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
  },

  tools: [
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_ver_horarios",
          description:
            "Devuelve los proximos horarios LIBRES reales para una llamada o cita (hasta 4). Usala antes de proponer horarios; nunca inventes una hora. Ofrece al cliente 2 o 3 de estas opciones con su etiqueta.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      },
      descripcionUI: "Consultar horarios libres de la agenda (y de Google Calendar si esta conectado).",
      async ejecutar(_args, ctx) {
        const opciones = await ofrecerHorarios(ctx.conversationId ?? null);
        if (opciones.length === 0) {
          return { ok: true, data: { opciones: [], mensaje: "No hay horarios libres en los proximos dias: deriva a una persona." } };
        }
        return { ok: true, data: { opciones } };
      },
    },
    {
      definicion: {
        type: "function",
        function: {
          name: "agenda_agendar",
          description:
            "Agenda la llamada o cita en UNO de los horarios que ofreciste con agenda_ver_horarios, cuando el cliente ya eligio. Solo confirma al cliente si esta herramienta devuelve ok. Si tenes su email, pasalo para que le llegue la invitacion con el link.",
          parameters: {
            type: "object",
            properties: {
              horario: {
                type: "string",
                description: "El horario elegido tal como lo ofreciste, con dia y hora (ej. 'lunes 9 de noviembre, 10:30'), o el valor 'inicio' de la opcion.",
              },
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
        });
        if (!r.ok) return { ok: false, error: r.motivo };
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
  ],
};

export default modulo;
