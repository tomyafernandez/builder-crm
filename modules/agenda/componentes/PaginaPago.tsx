import { CalendarCheck, CircleAlert, CircleCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import type { PropsPaginaPublica } from "@/lib/modules/types";
import { etiquetaHorario } from "../lib/horarios";
import { reservaVencida } from "../lib/sena";
import { zona } from "../lib/servicio";
import { leerCita } from "../lib/turnos";
import { BotonPagar } from "./BotonPagar";

/**
 * Pagina de pago de la sena (spec nucleo/19), SIN login: la abre el cliente desde el
 * link que le mando el agente. El id de la cita (UUID) es lo unico que la identifica, y
 * solo muestra servicio, dia, hora y monto: nada de datos del contacto.
 */
export async function PaginaPago({ params }: PropsPaginaPublica) {
  const c = await leerCita(params.id ?? "");
  if (!c || !c.senaCentavos) {
    return <Aviso icono="alerta" titulo="No encontramos esta reserva" texto="Revisa el link o escribinos por el chat." />;
  }
  const etiqueta = etiquetaHorario(c.inicio, zona());
  if (c.estado === "confirmada" || c.estado === "asistio" || c.senaPagadaAt) {
    return <Aviso icono="ok" titulo="Seña recibida" texto={`Tu turno${c.servicio ? ` de ${c.servicio}` : ""} del ${etiqueta} está confirmado.`} />;
  }
  if (c.estado === "vencida" || c.estado === "cancelada" || reservaVencida(c, new Date())) {
    return <Aviso icono="alerta" titulo="Esta reserva venció" texto="Se liberó el horario. Escribinos por el chat y te buscamos otro." />;
  }
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Seña para reservar tu turno</p>
          <p className="text-3xl font-semibold tabular-nums">{formatCurrency(c.senaCentavos)}</p>
        </div>
        <dl className="space-y-2 text-sm">
          {c.servicio && <Fila etiqueta="Servicio" valor={c.servicio} />}
          <Fila etiqueta="Día y hora" valor={etiqueta} />
          {c.precioCentavos ? <Fila etiqueta="Precio del servicio" valor={formatCurrency(c.precioCentavos)} /> : null}
          {c.senaVenceAt && (
            <Fila
              etiqueta="Pagala antes de las"
              valor={new Intl.DateTimeFormat("es-AR", { timeZone: zona(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(c.senaVenceAt)}
            />
          )}
        </dl>
        <BotonPagar citaId={c.id} monto={formatCurrency(c.senaCentavos)} />
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Pago de prueba: no se cobra nada. En una instalación real este botón es Mercado Pago.
        </p>
      </CardContent>
    </Card>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}

function Aviso({ icono, titulo, texto }: { icono: "ok" | "alerta"; titulo: string; texto: string }) {
  const Icono = icono === "ok" ? CircleCheck : CircleAlert;
  return (
    <Card>
      <CardContent className="space-y-2 p-6 text-center">
        <Icono className={icono === "ok" ? "mx-auto h-10 w-10 text-emerald-600" : "mx-auto h-10 w-10 text-amber-600"} />
        <p className="text-lg font-semibold">{titulo}</p>
        <p className="text-sm text-muted-foreground">{texto}</p>
        {icono === "ok" && <CalendarCheck className="mx-auto h-4 w-4 text-muted-foreground" />}
      </CardContent>
    </Card>
  );
}
