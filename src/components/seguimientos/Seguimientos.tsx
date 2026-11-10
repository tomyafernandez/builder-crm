"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

interface Resumen {
  activo: boolean;
  pasos: Array<{ trasHoras: number; plantilla?: string }>;
  horario: { desde: string; hasta: string };
  dias: number;
  enviados: number;
  conversacionesConSeguimiento: number;
  recuperadas: number;
  recientes: Array<{ conversationId: string | null; contacto: string | null; texto: string | null; paso: number | null; createdAt: string }>;
  esperando: Array<{ conversationId: string; contacto: string | null; motivo: string }>;
}

const horas = (h: number) => (h < 24 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} dias`);

/** Seguimiento automatico (spec nucleo/18): que salio, que se recupero y que viene. */
export function Seguimientos() {
  const [r, setR] = useState<Resumen | null>(null);
  const [corriendo, setCorriendo] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/seguimientos", { cache: "no-store" });
    if (res.ok) setR((await res.json()) as Resumen);
  }, []);

  useEffect(() => {
    fetch("/api/seguimientos", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .then((d: Resumen | null) => d && setR(d))
      .catch(() => {});
  }, []);

  const correr = async (prueba: boolean) => {
    setCorriendo(true);
    try {
      const res = await fetch("/api/seguimientos/correr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prueba }),
      });
      const d = (await res.json()) as { enviados?: number; revisadas?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? "No se pudo correr");
      toast.success(`${d.enviados ?? 0} seguimiento(s) enviados de ${d.revisadas ?? 0} conversaciones revisadas`);
      await cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCorriendo(false);
    }
  };

  const tasa = r && r.conversacionesConSeguimiento > 0 ? Math.round((100 * r.recuperadas) / r.conversacionesConSeguimiento) : null;

  return (
    <div>
      <PageHeader
        title="Seguimientos"
        subtitle="A quien dejo de responder se le vuelve a escribir, segun lo que habia preguntado."
      />
      {!r && <Loader2 className="h-4 w-4 animate-spin" />}
      {r && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <p className="text-3xl font-semibold">{r.enviados}</p>
                <p className="text-sm text-muted-foreground">Seguimientos enviados ({r.dias} dias)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-3xl font-semibold">{r.recuperadas}</p>
                <p className="text-sm text-muted-foreground">Conversaciones recuperadas (volvieron a responder)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-3xl font-semibold">{tasa === null ? "—" : `${tasa}%`}</p>
                <p className="text-sm text-muted-foreground">De las seguidas, cuantas respondieron</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ultimos seguimientos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {r.recientes.length === 0 && <p className="text-muted-foreground">Todavia no se envio ninguno.</p>}
                {r.recientes.map((m, i) => (
                  <a
                    key={i}
                    href={m.conversationId ? `/conversations/${m.conversationId}` : "#"}
                    className="block rounded-lg border px-3 py-2 hover:bg-muted/40"
                  >
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {m.contacto ?? "Contacto"} · paso {m.paso ?? "?"}
                      </span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1">{m.texto ?? "(plantilla)"}</p>
                  </a>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Repeat className="h-4 w-4" /> Como esta configurado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    Estado: <span className="font-medium">{r.activo ? "encendido" : "apagado"}</span>
                  </p>
                  <ol className="list-decimal pl-5 text-muted-foreground">
                    {r.pasos.map((p, i) => (
                      <li key={i}>
                        {horas(p.trasHoras)} despues del ultimo mensaje del cliente
                        {p.plantilla ? ` (plantilla ${p.plantilla})` : p.trasHoras >= 24 ? " (necesita plantilla en WhatsApp)" : ""}
                      </li>
                    ))}
                  </ol>
                  <p className="text-muted-foreground">
                    Solo entre {r.horario.desde} y {r.horario.hasta}. Se frena si el cliente responde, si se deriva a una persona o
                    si la etapa se cierra. Se cambia en config/cliente.ts (seguimiento).
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => correr(true)} disabled={corriendo || !r.activo} className="cursor-pointer">
                      {corriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Probar en el simulador
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => correr(false)} disabled={corriendo || !r.activo} className="cursor-pointer">
                      Correr ahora
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    &quot;Probar en el simulador&quot; solo toca conversaciones del simulador y no espera las horas.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Esperando</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {r.esperando.length === 0 && <p className="text-muted-foreground">Nadie esperando seguimiento.</p>}
                  {r.esperando.map((e) => (
                    <a key={e.conversationId} href={`/conversations/${e.conversationId}`} className="flex justify-between gap-2 hover:underline">
                      <span>{e.contacto ?? "Contacto"}</span>
                      <span className="text-xs text-muted-foreground">{e.motivo}</span>
                    </a>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
