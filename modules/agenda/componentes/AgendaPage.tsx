"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarCheck, Link2, Loader2, TimerOff, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FilaCita, type CitaVista as Cita } from "./FilaCita";
import { AjustesCobro, type AjustesCobroVista } from "./AjustesCobro";

interface Panel {
  ajustes: {
    dias: number[];
    desde: string;
    hasta: string;
    duracionMin: number;
    anticipacionMin: number;
    diasAdelante: number;
    titulo: string;
    descripcion: string | null;
  } & AjustesCobroVista;
  zona: string;
  google: { configurado: boolean; conectado: boolean; calendario: string | null; cifrado: boolean };
  esAdmin: boolean;
  citas: Cita[];
}

const API = "/api/m/agenda";
const DIAS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MENSAJES: Record<string, string> = {
  ok: "Google Calendar conectado",
  cancelado: "Cancelaste la conexion con Google",
  estado_invalido: "La conexion vencio, volve a intentarlo",
  error: "Google no acepto la conexion. Revisa el cliente OAuth y la URL de retorno.",
  solo_admin: "Solo un administrador puede conectar Google",
};

/** Agenda: proximas citas, conexion con Google Calendar y horarios de atencion. */
export function AgendaPage() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [ajustes, setAjustes] = useState<Panel["ajustes"] | null>(null);
  const [guardando, setGuardando] = useState(false);
  // La hora de referencia se toma una vez al montar (no durante el render).
  const [ahora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Panel;
    setPanel(data);
    setAjustes(data.ajustes);
  }, []);

  useEffect(() => {
    fetch(API, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Panel | null) => {
        if (!data) return;
        setPanel(data);
        setAjustes(data.ajustes);
      })
      .catch(() => {});
    const q = new URLSearchParams(window.location.search).get("google");
    if (q && MENSAJES[q]) (q === "ok" ? toast.success : toast.error)(MENSAJES[q]);
  }, []);

  const guardar = async () => {
    if (!ajustes) return;
    setGuardando(true);
    try {
      const res = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ajustes) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      toast.success("Horarios guardados");
      void cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setGuardando(false);
    }
  };

  const desconectar = async () => {
    await fetch(`${API}/google/desconectar`, { method: "POST" });
    toast.success("Google Calendar desconectado");
    void cargar();
  };

  const cancelarCita = async (id: string) => {
    const res = await fetch(`${API}/citas/${id}/cancelar`, { method: "POST" });
    if (res.ok) {
      toast.success("Cita cancelada");
      void cargar();
    } else toast.error("No se pudo cancelar");
  };

  const probar = async (accion: "recordatorios" | "vencer") => {
    const res = await fetch(`${API}/probar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion }) });
    const data = (await res.json().catch(() => ({}))) as { enviados?: number; detalle?: Array<{ resultado: string }>; error?: string };
    if (!res.ok) return toast.error(data.error ?? "No se pudo correr la prueba");
    const n = data.enviados ?? 0;
    toast.success(
      accion === "vencer"
        ? n ? `${n} reserva${n === 1 ? "" : "s"} vencida${n === 1 ? "" : "s"}` : "No hay reservas del simulador esperando la seña"
        : n ? `${n} recordatorio${n === 1 ? "" : "s"} enviado${n === 1 ? "" : "s"}` : data.detalle?.[0]?.resultado ?? "No hay turnos del simulador para recordar"
    );
    void cargar();
  };

  const ACTIVAS = ["agendada", "confirmada", "pendiente_sena"];
  const proximas = (panel?.citas ?? []).filter((c) => ACTIVAS.includes(c.estado) && new Date(c.fin).getTime() >= ahora).reverse();
  const pasadas = (panel?.citas ?? []).filter((c) => !proximas.includes(c)).slice(0, 20);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("es-AR", { timeZone: panel?.zona, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const hora = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: panel?.zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

  return (
    <div>
      <PageHeader title="Agenda" subtitle="Las llamadas que agenda el agente, con horarios libres reales." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarCheck className="h-4 w-4" /> Proximas ({proximas.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!panel && <Loader2 className="h-4 w-4 animate-spin" />}
              {panel && proximas.length === 0 && <p className="text-muted-foreground">No hay citas agendadas.</p>}
              {proximas.map((c) => (
                <FilaCita key={c.id} cita={c} fecha={fmt(c.inicio)} hora={hora} onCancelar={() => cancelarCita(c.id)} />
              ))}
            </CardContent>
          </Card>
          {pasadas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Anteriores y canceladas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {pasadas.map((c) => (
                  <FilaCita key={c.id} cita={c} fecha={fmt(c.inicio)} hora={hora} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {panel?.esAdmin && ajustes && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Probar ahora (solo simulador)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  Solo toca turnos de contactos creados en el Simulador y no espera los plazos. Sirve para mostrar el sistema sin esperar horas.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => probar("recordatorios")} className="cursor-pointer">
                    <BellRing className="h-3.5 w-3.5" /> Probar recordatorios ahora
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => probar("vencer")} className="cursor-pointer">
                    <TimerOff className="h-3.5 w-3.5" /> Vencer reservas ahora
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Google Calendar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {panel.google.conectado ? (
                  <>
                    <p>
                      Calendario conectado{panel.google.calendario ? `: ${panel.google.calendario}` : ""}. El agente lo mira antes de
                      ofrecer horarios y crea ahi el evento con Meet.
                    </p>
                    <Button size="sm" variant="outline" onClick={desconectar} className="cursor-pointer">
                      <Unlink className="h-3.5 w-3.5" /> Desconectar
                    </Button>
                  </>
                ) : !panel.google.configurado ? (
                  <p className="text-muted-foreground">
                    Faltan las variables GOOGLE_CALENDAR_CLIENT_ID y GOOGLE_CALENDAR_CLIENT_SECRET. Sin Google, la agenda
                    funciona igual con tus horarios, pero sin link de Meet.
                  </p>
                ) : !panel.google.cifrado ? (
                  <p className="text-muted-foreground">Falta ENCRYPTION_KEY para guardar el acceso a Google cifrado.</p>
                ) : (
                  <a href={`${API}/google/conectar`}>
                    <Button size="sm" className="cursor-pointer">
                      <Link2 className="h-3.5 w-3.5" /> Conectar Google Calendar
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horarios para agendar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1">
                  {DIAS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setAjustes({ ...ajustes, dias: ajustes.dias.includes(i) ? ajustes.dias.filter((x) => x !== i) : [...ajustes.dias, i].sort() })
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs cursor-pointer",
                        ajustes.dias.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo etiqueta="Desde">
                    <Input type="time" value={ajustes.desde} onChange={(e) => setAjustes({ ...ajustes, desde: e.target.value })} />
                  </Campo>
                  <Campo etiqueta="Hasta">
                    <Input type="time" value={ajustes.hasta} onChange={(e) => setAjustes({ ...ajustes, hasta: e.target.value })} />
                  </Campo>
                  <Campo etiqueta="Duracion (min)">
                    <Input type="number" value={ajustes.duracionMin} onChange={(e) => setAjustes({ ...ajustes, duracionMin: Number(e.target.value) })} />
                  </Campo>
                  <Campo etiqueta="Aviso minimo (h)">
                    <Input
                      type="number"
                      value={Math.round(ajustes.anticipacionMin / 60)}
                      onChange={(e) => setAjustes({ ...ajustes, anticipacionMin: Number(e.target.value) * 60 })}
                    />
                  </Campo>
                </div>
                <Campo etiqueta="Titulo del evento">
                  <Input value={ajustes.titulo} onChange={(e) => setAjustes({ ...ajustes, titulo: e.target.value })} />
                </Campo>
                <p className="text-xs text-muted-foreground">Zona horaria: {panel.zona} (se cambia en config/cliente.ts).</p>
                <AjustesCobro valor={ajustes} onChange={(v) => setAjustes({ ...ajustes, ...v })} />
                <Button size="sm" onClick={guardar} disabled={guardando} className="cursor-pointer">
                  {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      {children}
    </label>
  );
}
