"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Loader2, Plus, User, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ETIQUETA_HALLAZGO, type Caso, type DetalleCorrida, type Hallazgo } from "./tipos";

const COLOR: Record<string, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-red-500",
};

export function Semaforo({ veredicto }: { veredicto: string | null }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", veredicto ? COLOR[veredicto] : "bg-muted-foreground/30")}
      aria-label={veredicto ?? "sin veredicto"}
    />
  );
}

/** Detalle de una corrida: cada cliente simulado, que paso y que hay que arreglar. */
export function DetalleCorridaVista({ corrida, onAplicada }: { corrida: DetalleCorrida; onAplicada?: () => void }) {
  const delta =
    corrida.puntaje !== null && corrida.puntajeAnterior !== null ? corrida.puntaje - corrida.puntajeAnterior : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>Resultado: {corrida.puntaje === null ? "sin puntaje" : `${corrida.puntaje}/100`}</span>
          {delta !== null && (
            <span className={cn("text-sm font-normal", delta >= 0 ? "text-emerald-600" : "text-red-600")}>
              {delta >= 0 ? "+" : ""}
              {delta} vs la anterior
            </span>
          )}
          <span className="text-xs font-normal text-muted-foreground">
            Agente: {corrida.modelo ?? "?"} · Juez: {corrida.modeloJuez ?? "?"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {corrida.error && <p className="text-sm text-red-600">{corrida.error}</p>}
        {corrida.casos.map((c) => (
          <CasoFila key={c.id} caso={c} channel={corrida.channel} onAplicada={onAplicada} />
        ))}
      </CardContent>
    </Card>
  );
}

function CasoFila({ caso, channel, onAplicada }: { caso: Caso; channel: string; onAplicada?: () => void }) {
  const [abierto, setAbierto] = useState(caso.veredicto === "rojo");
  const hallazgos = caso.hallazgos ?? [];
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-muted/40"
      >
        {abierto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Semaforo veredicto={caso.veredicto} />
        <span className="font-medium text-sm">{caso.personaNombre}</span>
        <span className="ml-auto text-xs text-muted-foreground truncate">
          {caso.estado === "listo"
            ? `${hallazgos.length} hallazgo${hallazgos.length === 1 ? "" : "s"}`
            : caso.estado === "juez_fallo"
              ? "el juez no pudo evaluarlo"
              : caso.estado === "fallo"
                ? "fallo"
                : "en curso..."}
        </span>
      </button>
      {abierto && (
        <div className="space-y-3 border-t px-3 py-3 text-sm">
          {caso.persona?.descripcion && <p className="text-muted-foreground">{caso.persona.descripcion}</p>}
          {caso.persona?.esperado && (
            <p className="text-xs">
              <span className="font-medium">Esperado:</span> {caso.persona.esperado}
            </p>
          )}
          {caso.resumen && <p className="whitespace-pre-line">{caso.resumen}</p>}
          {caso.error && <p className="text-red-600 text-xs">{caso.error}</p>}
          <Transcripcion turnos={caso.transcripcion ?? []} />
          {hallazgos.map((h, i) => (
            <HallazgoTarjeta key={i} hallazgo={h} channel={channel} onAplicada={onAplicada} />
          ))}
        </div>
      )}
    </div>
  );
}

function Transcripcion({ turnos }: { turnos: NonNullable<Caso["transcripcion"]> }) {
  if (turnos.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md bg-muted/30 p-2.5">
      {turnos.map((t, i) => (
        <div key={i} className={cn("flex", t.rol === "cliente" ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] whitespace-pre-line",
              t.rol === "cliente" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm"
            )}
          >
            <span className="mr-1.5 inline-flex align-middle opacity-70">
              {t.rol === "cliente" ? <User className="h-3 w-3" /> : t.rol === "agente" ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
            </span>
            {t.texto}
          </div>
        </div>
      ))}
    </div>
  );
}

function HallazgoTarjeta({ hallazgo, channel, onAplicada }: { hallazgo: Hallazgo; channel: string; onAplicada?: () => void }) {
  const [respuesta, setRespuesta] = useState(hallazgo.sugerencia?.respuesta ?? "");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const pendiente = /\[COMPLETAR/i.test(respuesta);

  const aplicar = async () => {
    if (!hallazgo.sugerencia) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/laboratorio/sugerencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, pregunta: hallazgo.sugerencia.pregunta, respuesta }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; destino?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo agregar");
      setHecho(true);
      toast.success(
        data.destino === "canal" ? "Agregado al prompt de este canal" : "Agregado al prompt general del agente"
      );
      onAplicada?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/40 p-2.5 dark:bg-amber-500/5">
      <p className="text-xs font-medium">{ETIQUETA_HALLAZGO[hallazgo.tipo] ?? hallazgo.tipo}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{hallazgo.evidencia}</p>
      {hallazgo.sugerencia && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs">
            <span className="font-medium">Agregar al agente:</span> {hallazgo.sugerencia.pregunta}
          </p>
          <Textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={2}
            className="text-xs"
            disabled={hecho}
            aria-label="Respuesta que va a aprender el agente"
          />
          {pendiente && !hecho && (
            <p className="text-[11px] text-amber-700">Reemplaza [COMPLETAR] por el dato real del negocio.</p>
          )}
          <Button size="sm" variant="outline" onClick={aplicar} disabled={guardando || hecho || pendiente || !respuesta.trim()} className="cursor-pointer">
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {hecho ? "Agregado" : "Agregar al agente"}
          </Button>
        </div>
      )}
    </div>
  );
}
