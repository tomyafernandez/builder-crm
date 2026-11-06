import { CalendarClock } from "lucide-react";
import type { ManifiestoModulo } from "@/lib/modules/types";

/**
 * Modulo agenda: el agente ofrece horarios libres reales y agenda llamadas o citas,
 * con Google Calendar opcional (disponibilidad + evento con Meet). Generico: sirve para
 * llamadas de venta, clases de prueba, entrevistas o visitas.
 */
const manifiesto: ManifiestoModulo = {
  nombre: "agenda",
  titulo: "Agenda",
  descripcion: "Horarios disponibles, llamadas agendadas por el agente y sincronizacion con Google Calendar.",
  version: "1.0.0",
  nav: [{ etiqueta: "Agenda", icono: CalendarClock, seccion: "Productividad" }],
};

export default manifiesto;
