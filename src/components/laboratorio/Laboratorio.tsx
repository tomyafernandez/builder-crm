"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { CHANNELS, CHANNEL_LABELS, type Channel } from "@/lib/channels/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DetalleCorridaVista } from "./DetalleCorrida";
import type { DetalleCorrida, ResumenCorrida } from "./tipos";

interface Panel {
  corridas: ResumenCorrida[];
  personas: Array<{ clave: string; nombre: string; descripcion: string }>;
  puntajeMinimo: number;
  exigir: boolean;
  hayClave: boolean;
  modelo: string;
  modeloJuez: string;
}

/**
 * Laboratorio (spec nucleo/17): clientes simulados contra el agente real, un juez que
 * los evalua y un puntaje. La corrida avanza de a un paso por llamada; esta pantalla
 * es la que la empuja, asi que tiene que quedar abierta mientras corre.
 */
export function Laboratorio() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [canal, setCanal] = useState<Channel>("whatsapp");
  const [corriendo, setCorriendo] = useState<ResumenCorrida | null>(null);
  const [detalle, setDetalle] = useState<DetalleCorrida | null>(null);
  const detener = useRef(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/laboratorio", { cache: "no-store" });
    if (res.ok) setPanel((await res.json()) as Panel);
  }, []);

  const abrir = useCallback(async (id: string) => {
    const res = await fetch(`/api/laboratorio/corridas/${id}`, { cache: "no-store" });
    if (res.ok) setDetalle((await res.json()) as DetalleCorrida);
  }, []);

  useEffect(() => {
    fetch("/api/laboratorio", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Panel | null) => data && setPanel(data))
      .catch(() => {});
  }, []);

  const empujar = async (id: string) => {
    detener.current = false;
    for (let i = 0; i < 200 && !detener.current; i++) {
      const res = await fetch(`/api/laboratorio/corridas/${id}/avanzar`, { method: "POST" });
      if (!res.ok) throw new Error("Se corto la corrida");
      const r = (await res.json()) as ResumenCorrida;
      setCorriendo(r);
      if (r.estado !== "en_curso") break;
    }
    setCorriendo(null);
    await Promise.all([cargar(), abrir(id)]);
  };

  const correr = async () => {
    try {
      const res = await fetch("/api/laboratorio/corridas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: canal }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "No se pudo arrancar");
      setDetalle(null);
      await empujar(data.id);
    } catch (err) {
      setCorriendo(null);
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const cancelar = async () => {
    if (!corriendo) return;
    detener.current = true;
    await fetch(`/api/laboratorio/corridas/${corriendo.id}`, { method: "DELETE" });
    setCorriendo(null);
    void cargar();
  };

  const ultima = panel?.corridas.find((c) => c.estado === "terminada" && c.channel === canal);

  return (
    <div>
      <PageHeader
        title="Laboratorio"
        subtitle="Clientes simulados prueban al agente antes de que hable con clientes reales. Nada sale a ningun canal."
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> Nueva corrida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={canal === c ? "default" : "outline"}
                    onClick={() => setCanal(c)}
                    disabled={Boolean(corriendo)}
                    className="cursor-pointer"
                  >
                    {CHANNEL_LABELS[c]}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground">
                {panel?.personas.length ?? 0} clientes simulados · minimo para aprobar: {panel?.puntajeMinimo ?? 85}/100
                {panel?.exigir ? " (obligatorio para encender el agente)" : ""}
              </p>
              {panel && !panel.hayClave && (
                <p className="text-red-600">Falta OPENROUTER_API_KEY: sin proveedor de IA no hay agente ni juez.</p>
              )}
              {corriendo ? (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${corriendo.total ? (100 * corriendo.hechos) / corriendo.total : 0}%` }}
                    />
                  </div>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {corriendo.hechos} de {corriendo.total} clientes. No
                    cierres esta pantalla.
                  </p>
                  <Button size="sm" variant="outline" onClick={cancelar} className="cursor-pointer">
                    <Square className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                </div>
              ) : (
                <Button onClick={correr} disabled={!panel?.hayClave} className="cursor-pointer">
                  <Play className="h-4 w-4" /> Correr el Laboratorio en {CHANNEL_LABELS[canal]}
                </Button>
              )}
              {ultima && (
                <p className="text-xs text-muted-foreground">
                  Ultimo resultado en {CHANNEL_LABELS[canal]}: <span className="font-medium text-foreground">{ultima.puntaje}/100</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {!panel?.corridas.length && <p className="text-muted-foreground">Todavia no hay corridas.</p>}
              {panel?.corridas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void abrir(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50 cursor-pointer",
                    detalle?.id === c.id && "bg-muted"
                  )}
                >
                  <span className="font-medium w-14">{c.puntaje === null ? "—" : `${c.puntaje}/100`}</span>
                  <span className="text-muted-foreground">{CHANNEL_LABELS[c.channel as Channel] ?? c.channel}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.estado === "en_curso" ? "en curso" : c.estado === "fallida" ? "fallida" : new Date(c.createdAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div>
          {detalle ? (
            <DetalleCorridaVista corrida={detalle} />
          ) : (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                Corre el Laboratorio o abri una corrida del historial para ver como atendio el agente a cada cliente,
                que hay que corregir y agregarle lo que le falta saber con un clic.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
