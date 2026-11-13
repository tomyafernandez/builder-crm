import "server-only";
import type { Intervalo } from "./horarios";

/**
 * Google Calendar por REST (sin SDK): OAuth del dueno de la agenda, disponibilidad
 * (freeBusy) y eventos con Meet. Las credenciales son del propio negocio:
 * GOOGLE_CALENDAR_CLIENT_ID y GOOGLE_CALENDAR_CLIENT_SECRET (un cliente OAuth "Aplicacion
 * web" de su Google Cloud, gratis). Las URLs base se pueden cambiar solo para pruebas.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.AGENDA_GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const API = () => process.env.AGENDA_GOOGLE_API_URL || "https://www.googleapis.com/calendar/v3";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

export function urlRetorno(origen: string): string {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || origen).replace(/\/$/, "");
  return `${base}/api/m/agenda/google/callback`;
}

export function urlAutorizacion(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function pedirToken(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
      ...params,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    // Nunca se loguea el cuerpo de la peticion: lleva el secreto del cliente.
    throw new Error(`Google rechazo la autorizacion: ${data.error ?? res.status}${data.error_description ? ` (${data.error_description})` : ""}`);
  }
  return data;
}

/** Canjea el `code` del consentimiento. Devuelve el refresh token y el correo. */
export async function canjearCodigo(code: string, redirectUri: string): Promise<{ refreshToken: string; email: string | null }> {
  const data = await pedirToken({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!data.refresh_token) {
    throw new Error("Google no devolvio un refresh token. Quita el acceso de la app en tu cuenta de Google y volve a conectar.");
  }
  let email: string | null = null;
  if (data.id_token) {
    try {
      const carga = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8")) as { email?: string };
      email = carga.email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: data.refresh_token, email };
}

const cache = new Map<string, { token: string; vence: number }>();

async function accessToken(refreshToken: string): Promise<string> {
  const guardado = cache.get(refreshToken);
  if (guardado && guardado.vence > Date.now() + 60_000) return guardado.token;
  const data = await pedirToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
  cache.set(refreshToken, { token: data.access_token!, vence: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token!;
}

async function llamar<T>(refreshToken: string, ruta: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(refreshToken);
  const res = await fetch(`${API()}${ruta}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Calendar: ${data.error?.message ?? res.status}`);
  return data;
}

/** Bloques ocupados del calendario entre dos instantes. */
export async function ocupadoEnGoogle(refreshToken: string, calendarId: string, desde: Date, hasta: Date): Promise<Intervalo[]> {
  const data = await llamar<{ calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }> }>(
    refreshToken,
    "/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({ timeMin: desde.toISOString(), timeMax: hasta.toISOString(), items: [{ id: calendarId }] }),
    }
  );
  const cal = data.calendars?.[calendarId];
  if (cal?.errors?.length) throw new Error("Google Calendar no dejo leer la disponibilidad");
  return (cal?.busy ?? []).map((b) => ({ inicio: new Date(b.start), fin: new Date(b.end) }));
}

/** Crea el evento con Meet e invita al cliente si dio su correo. */
export async function crearEvento(
  refreshToken: string,
  calendarId: string,
  input: { inicio: Date; fin: Date; zona: string; titulo: string; descripcion: string; email?: string | null }
): Promise<{ id: string; meet: string | null; link: string | null }> {
  const cuerpo = {
    summary: input.titulo,
    description: input.descripcion,
    start: { dateTime: input.inicio.toISOString(), timeZone: input.zona },
    end: { dateTime: input.fin.toISOString(), timeZone: input.zona },
    attendees: input.email ? [{ email: input.email }] : undefined,
    conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    reminders: { useDefault: true },
  };
  const q = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: input.email ? "all" : "none" });
  const ev = await llamar<{ id: string; hangoutLink?: string; htmlLink?: string }>(
    refreshToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${q}`,
    { method: "POST", body: JSON.stringify(cuerpo) }
  );
  return { id: ev.id, meet: ev.hangoutLink ?? null, link: ev.htmlLink ?? null };
}

export async function cancelarEvento(refreshToken: string, calendarId: string, eventId: string): Promise<void> {
  await llamar(refreshToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "DELETE",
  });
}

/** Mueve un evento a otro horario (reagenda). Mantiene invitados y Meet. */
export async function moverEvento(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  input: { inicio: Date; fin: Date; zona: string }
): Promise<void> {
  await llamar(refreshToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    body: JSON.stringify({
      start: { dateTime: input.inicio.toISOString(), timeZone: input.zona },
      end: { dateTime: input.fin.toISOString(), timeZone: input.zona },
    }),
  });
}
