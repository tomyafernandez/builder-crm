import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import type { Retorno } from "@/lib/retorno";

/**
 * "Lo que te dejo el sistema" (spec nucleo/19). Cada linea lleva su cuenta a la vista:
 * el dueno tiene que poder rehacerla con una calculadora. Lo estimado se dice.
 */
export function RetornoCard({ retorno }: { retorno: Retorno }) {
  // Plata que no suma al total (ej. senas): va aparte, debajo del total.
  const aparte = retorno.lineas.filter((l) => l.montoCentavos !== null && l.sumaAlTotal === false);
  const lineas = retorno.lineas.filter((l) => !aparte.includes(l));
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Lo que te dejo el sistema
          <span className="text-xs font-normal text-muted-foreground">ultimos {retorno.dias} dias</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lineas.map((l) => (
            <div key={l.clave} className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">
                {l.etiqueta}
                {l.estimado && <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">estimado</span>}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {l.montoCentavos !== null ? formatCurrency(l.montoCentavos) : l.valorTexto}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{l.cuenta}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium">Total en {retorno.dias} dias</p>
          <p className="text-2xl font-semibold tabular-nums text-primary">
            {formatCurrency(retorno.totalCentavos)}
            {retorno.totalEstimado && <span className="ml-2 text-xs font-normal text-muted-foreground">incluye estimados</span>}
          </p>
        </div>
        {aparte.map((l) => (
          <div key={l.clave} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-medium">{l.etiqueta}</p>
              <p className="text-[11px] text-muted-foreground">{l.cuenta}</p>
            </div>
            <p className="text-xl font-semibold tabular-nums">{formatCurrency(l.montoCentavos!)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
