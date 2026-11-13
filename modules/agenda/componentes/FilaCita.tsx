"use client";

import { ExternalLink, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface CitaVista {
  id: string;
  contactId: string;
  inicio: string;
  fin: string;
  estado: string;
  titulo: string;
  emailInvitado: string | null;
  notas: string | null;
  origen: string;
  meetLink: string | null;
  googleLink: string | null;
  contactName: string | null;
  contactPhone: string | null;
  servicio: string | null;
  precioCentavos: number | null;
  senaCentavos: number | null;
  senaVenceAt: string | null;
  senaPagadaAt: string | null;
  recordatorioEnviadoAt: string | null;
  confirmadaPorClienteAt: string | null;
}

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pendiente_sena: { texto: "Seña pendiente", clase: "bg-amber-100 text-amber-900" },
  confirmada: { texto: "Confirmado", clase: "bg-emerald-100 text-emerald-900" },
  agendada: { texto: "Agendado", clase: "bg-sky-100 text-sky-900" },
  vencida: { texto: "Vencida sin seña", clase: "bg-muted text-muted-foreground" },
  cancelada: { texto: "Cancelada", clase: "bg-muted text-muted-foreground" },
  asistio: { texto: "Asistió", clase: "bg-emerald-50 text-emerald-800" },
  ausente: { texto: "Ausente", clase: "bg-rose-100 text-rose-900" },
  realizada: { texto: "Realizada", clase: "bg-muted text-muted-foreground" },
};

export function FilaCita({ cita, fecha, hora, onCancelar }: { cita: CitaVista; fecha: string; hora: (iso: string) => string; onCancelar?: () => void }) {
  const e = ESTADOS[cita.estado] ?? { texto: cita.estado, clase: "bg-muted" };
  const apagada = ["cancelada", "vencida"].includes(cita.estado);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2", apagada && "opacity-60")}>
      <span className="font-medium w-40 shrink-0">{fecha}</span>
      <a href={`/contacts/${cita.contactId}`} className="hover:underline">
        {cita.contactName ?? "Contacto"}
      </a>
      {cita.servicio && (
        <span className="text-xs text-muted-foreground">
          {cita.servicio}
          {cita.precioCentavos ? ` · ${formatCurrency(cita.precioCentavos)}` : ""}
        </span>
      )}
      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", e.clase)}>{e.texto}</span>
      {cita.senaCentavos ? (
        <span className="text-[11px] text-muted-foreground">
          {cita.senaPagadaAt
            ? `seña ${formatCurrency(cita.senaCentavos)} pagada`
            : cita.estado === "pendiente_sena" && cita.senaVenceAt
              ? `seña ${formatCurrency(cita.senaCentavos)} · vence ${hora(cita.senaVenceAt)}`
              : `seña ${formatCurrency(cita.senaCentavos)}`}
        </span>
      ) : null}
      {cita.recordatorioEnviadoAt && (
        <span className="text-[11px] text-muted-foreground">{cita.confirmadaPorClienteAt ? "recordado · confirmó" : "recordado"}</span>
      )}
      <span className="text-[11px] text-muted-foreground">{cita.origen === "agente" ? "agendó el agente" : "a mano"}</span>
      <span className="ml-auto flex items-center gap-2">
        {cita.meetLink && (
          <a href={cita.meetLink} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
            <Video className="h-3.5 w-3.5" /> Meet
          </a>
        )}
        {cita.googleLink && (
          <a href={cita.googleLink} target="_blank" rel="noreferrer" className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <ExternalLink className="h-3.5 w-3.5" /> Google
          </a>
        )}
        {onCancelar && (
          <Button size="sm" variant="ghost" onClick={onCancelar} className="h-7 px-2 cursor-pointer" aria-label="Cancelar cita">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </span>
    </div>
  );
}
