"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotonPagar({ citaId, monto }: { citaId: string; monto: string }) {
  const router = useRouter();
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagar = async () => {
    setPagando(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/agenda/publico/pago/${citaId}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar el pago");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setPagando(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button className="h-11 w-full cursor-pointer text-base" onClick={pagar} disabled={pagando}>
        {pagando && <Loader2 className="h-4 w-4 animate-spin" />} Pagar {monto}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
