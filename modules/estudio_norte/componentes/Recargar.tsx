"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * /m/estudio_norte (sin entrada en el menu): recarga los 30 dias de datos con fechas de hoy.
 * Las conversaciones del Simulador no se tocan.
 */
export function Recargar() {
  const [cargando, setCargando] = useState(false);
  const recargar = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/m/estudio_norte/recargar", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo recargar");
      toast.success("Datos recargados con fechas de hoy");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCargando(false);
    }
  };
  return (
    <div>
      <PageHeader title="Datos de la demo" subtitle="Estudio Norte: 30 días de actividad inventada." />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Recargar con fechas de hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Borra los datos sembrados y los vuelve a crear terminando hoy. La tarjeta del panel queda en USD 2.299 en 30 días. No toca lo
            creado desde el Simulador. Tarda unos segundos.
          </p>
          <Button onClick={recargar} disabled={cargando} className="cursor-pointer">
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Recargar datos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
