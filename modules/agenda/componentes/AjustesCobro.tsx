"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AjustesCobroVista {
  servicios: Array<{ nombre: string; precioCentavos: number; duracionMin?: number }>;
  senaPorcentaje: number | null;
  senaPlazoMin: number;
  recordatorioActivo: boolean;
  recordatorioHorasAntes: number;
  recordatorioPlantilla: string | null;
  proveedorPago: string;
}

/** Servicios con precio, sena y recordatorio (spec nucleo/19). Montos en centavos. */
export function AjustesCobro({ valor, onChange }: { valor: AjustesCobroVista; onChange: (v: AjustesCobroVista) => void }) {
  const servicios = valor.servicios ?? [];
  const setServicio = (i: number, cambio: Partial<AjustesCobroVista["servicios"][number]>) =>
    onChange({ ...valor, servicios: servicios.map((s, k) => (k === i ? { ...s, ...cambio } : s)) });

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Servicios (precio en la moneda de la instancia)</p>
        {servicios.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2">
            <Input value={s.nombre} placeholder="Nombre" onChange={(e) => setServicio(i, { nombre: e.target.value })} />
            <Input
              type="number"
              value={s.precioCentavos / 100}
              onChange={(e) => setServicio(i, { precioCentavos: Math.round(Number(e.target.value) * 100) })}
              aria-label="Precio"
            />
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer px-0"
              aria-label="Quitar servicio"
              onClick={() => onChange({ ...valor, servicios: servicios.filter((_, k) => k !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onChange({ ...valor, servicios: [...servicios, { nombre: "", precioCentavos: 0 }] })}>
          <Plus className="h-3.5 w-3.5" /> Servicio
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Seña (%) · vacío = sin seña</span>
          <Input
            type="number"
            value={valor.senaPorcentaje ?? ""}
            onChange={(e) => onChange({ ...valor, senaPorcentaje: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Plazo para pagarla (min)</span>
          <Input type="number" value={valor.senaPlazoMin} onChange={(e) => onChange({ ...valor, senaPlazoMin: Number(e.target.value) })} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={valor.recordatorioActivo} onChange={(e) => onChange({ ...valor, recordatorioActivo: e.target.checked })} />
        <span>Recordar el turno y pedir confirmación</span>
      </label>
      {valor.recordatorioActivo && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Horas antes</span>
            <Input type="number" value={valor.recordatorioHorasAntes} onChange={(e) => onChange({ ...valor, recordatorioHorasAntes: Number(e.target.value) })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Plantilla WhatsApp (fuera de 24 h)</span>
            <Input value={valor.recordatorioPlantilla ?? ""} onChange={(e) => onChange({ ...valor, recordatorioPlantilla: e.target.value || null })} />
          </label>
        </div>
      )}
    </div>
  );
}
