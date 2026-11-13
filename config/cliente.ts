import { definirConfig } from "@/lib/config/schema";
import modulos from "./modulos.json";

/**
 * CONFIGURACION DE ESTA INSTANCIA: la demo "Estudio Norte" (rama `demo`).
 *
 * Un negocio sin rubro que vende servicios con turno y cobra sena. Sirve para el video de
 * venta de Levari y para las demos en vivo: es el MISMO CRM que se instala en produccion.
 * Lo unico simulado son los canales (Simulador) y el pago de la sena (pagina de prueba).
 * El agente es real y Google Calendar tambien (calendario "Demo Levari").
 *
 * Spec: specs/estudio-norte/spec.md. Servicios, sena y recordatorio viven en la agenda
 * (los carga el seed del modulo `estudio_norte`).
 */

const PROMPT = `# QUIÉN SOS
Atendés el WhatsApp y el Instagram de Estudio Norte, en Palermo, Buenos Aires. Estudio Norte da sesiones con turno. Respondés consultas, ayudás a elegir el servicio, das los horarios libres reales, reservás el turno, cobrás la seña y confirmás.

# CÓMO ESCRIBÍS
- Cálida y cercana, en rioplatense (vos). Mensajes cortos, uno por turno, sin listas largas.
- Saludás solo en el primer mensaje. Nunca dos preguntas en el mismo mensaje.
- Sin signos de apertura (escribí "Cómo estás?", nunca "¿Cómo estás?"). Emojis casi nunca.
- Nunca digas que esto es una demo ni una prueba.

# SERVICIOS Y PRECIOS (en dólares, USD)
- Primera consulta: USD 40. Para quien viene por primera vez.
- Sesión individual: USD 80.
- Plan mensual (4 sesiones): USD 280. Se agenda la primera sesión; las otras se coordinan después.
Todos duran 60 minutos. Nunca inventes un precio ni un descuento: si preguntan algo que no está acá, decí que lo consultás con el equipo.

# SEÑA
Para reservar se paga una seña del 30% por Mercado Pago (Primera consulta USD 12, Sesión individual USD 24, Plan mensual USD 84). Hay 1 hora para pagarla; si no, se libera el horario. El turno queda confirmado cuando se acredita la seña.

# PREGUNTAS FRECUENTES
- Formas de pago: efectivo, transferencia o tarjeta. La seña, por Mercado Pago.
- Cancelación: hasta 24 h antes se reprograma sin costo. Si falta sin avisar, pierde la seña.
- Ubicación: Palermo, Buenos Aires. La dirección exacta se manda con la confirmación del turno.
- Horarios de atención: lunes a sábado de 9 a 19.

# CÓMO SE DA LA CHARLA
1. Respondé lo que preguntó y calificá con 1 o 2 preguntas, de a una: qué busca, si es la primera vez, para cuándo. Guardá lo que te diga con actualizar_contacto (servicio_interes, primera_vez, para_cuando) y mové la etapa a "Calificado".
2. Si quiere turno: usá agenda_ver_horarios y ofrecé 2 o 3 opciones, tal cual vienen. Nunca inventes un horario.
3. Cuando elige: agenda_agendar con el horario y el servicio. Mandale el link de pago tal cual, con el monto de la seña y el plazo de 1 hora. No digas que el turno está confirmado hasta que pague.
4. Si responde al recordatorio que viene: agenda_confirmar_asistencia y despedite con calidez.
5. Si quiere cambiar el turno: agenda_mis_turnos, agenda_ver_horarios, ofrecé opciones y agenda_reprogramar con la que elija. La seña pagada queda para el turno nuevo.
6. Si escribe un reclamo, algo delicado (salud, un problema con un pago, un enojo) o pide hablar con una persona: derivar_asesor.

# QUÉ NO HACÉS
No inventás precios, horarios ni promociones. No confirmás un turno sin la seña. No das consejos profesionales por chat.`;

export default definirConfig({
  marca: {
    nombre: "Estudio Norte",
    nombreCorto: "Est. Norte",
    descripcion: "Turnos, señas y consultas, ordenados en un solo lugar.",
    logo: "/marca/logo.png",
    icono: "/marca/icono.png",
    colorPrimario: "#1F4E5F",
    colorSidebar: "#112F3A",
  },

  idioma: "es",
  moneda: "USD",
  zonaHoraria: "America/Argentina/Buenos_Aires",

  roles: {
    etiquetaAsesor: "Recepción",
  },

  pipeline: {
    nombre: "Clientes",
    etapas: [
      { clave: "nueva_consulta", nombre: "Nueva consulta", color: "#64748b" },
      { clave: "calificado", nombre: "Calificado", color: "#2563eb" },
      { clave: "sena_pendiente", nombre: "Seña pendiente", color: "#d97706" },
      { clave: "turno_confirmado", nombre: "Turno confirmado", color: "#1F4E5F" },
      { clave: "cliente", nombre: "Cliente", color: "#16a34a", ganada: true },
      { clave: "perdido", nombre: "Perdido", color: "#dc2626", perdida: true },
    ],
  },

  contacto: {
    campos: [
      {
        clave: "servicio_interes",
        etiqueta: "Servicio de interés",
        tipo: "seleccion",
        opciones: ["Primera consulta", "Sesión individual", "Plan mensual"],
        enTabla: true,
        agente: { descripcion: "qué servicio le interesa" },
      },
      {
        clave: "para_cuando",
        etiqueta: "Para cuándo",
        tipo: "texto",
        enTabla: true,
        agente: { descripcion: "para cuándo quiere el turno (esta semana, un día puntual...)" },
      },
      {
        clave: "primera_vez",
        etiqueta: "Primera vez",
        tipo: "seleccion",
        opciones: ["Sí", "No"],
        enTabla: true,
        agente: { descripcion: "si es la primera vez que viene a Estudio Norte" },
      },
    ],
  },

  agente: {
    nombre: "Estudio Norte",
    prompt: PROMPT,
    // Gratis en OpenRouter. AGENT_MODEL en la instancia manda sobre esto.
    modelo: "nvidia/nemotron-3.5-super-vl:free",
    mensajeDerivacion: "Te paso con alguien del equipo que te ayuda con esto. En un ratito te escribe.",
    sinSignosApertura: true,
  },

  // Seguimiento (spec nucleo/18): a las 3 h y a las 22 h del ultimo mensaje del cliente.
  // A quien ya reservo no se lo persigue: de eso se ocupan la sena y el recordatorio.
  seguimiento: {
    activo: true,
    pasos: [
      { trasHoras: 3, idiomaPlantilla: "es_AR" },
      { trasHoras: 22, idiomaPlantilla: "es_AR" },
    ],
    horario: { desde: "09:00", hasta: "21:00" },
    etapasSinSeguimiento: ["sena_pendiente", "turno_confirmado"],
    instrucciones:
      "Sin saludar de nuevo. Retomá lo que preguntó (el servicio, el precio o el horario) y ofrecé ver horarios para esta semana. Corto y cálido.",
  },

  // Tarjeta "Lo que te dejo el sistema" (spec nucleo/19), con los numeros del caso de la
  // web de Levari: ~160 h al mes (1,5 min por mensaje) = una persona de jornada completa (sueldo de referencia
  // USD 700). Conservador a proposito: en la realidad puede ser el trabajo de dos.
  retorno: {
    activo: true,
    minutosPorMensaje: 1.5,
    tasaAusencia: 0.15,
    sueldoReferenciaCentavos: 70000,
    horasJornadaMes: 160,
  },

  laboratorio: {
    puntajeMinimo: 85,
    exigir: false,
    personas: [
      {
        clave: "primera_vez",
        nombre: "Primera vez, quiere turno",
        descripcion: "Nunca vino; pregunta precio y quiere turno esta semana.",
        guion: ["Hola! cuanto sale una sesion?", "Es la primera vez que voy", "Esta semana si se puede, a la tarde"],
        esperado: "Dar el precio de la Primera consulta (USD 40), calificar de a una pregunta, ofrecer horarios reales con agenda_ver_horarios y no inventar nada.",
      },
      {
        clave: "reclamo",
        nombre: "Reclamo por un cobro",
        descripcion: "Le cobraron la sena dos veces.",
        guion: ["Hola, me cobraron la seña dos veces y nadie me responde"],
        esperado: "Disculparse y derivar a una persona con derivar_asesor.",
      },
      {
        clave: "descuento",
        nombre: "Pide descuento",
        descripcion: "Quiere un precio especial.",
        guion: ["Hacen descuento si pago en efectivo?"],
        esperado: "No inventar descuentos; decir que lo consulta con el equipo.",
      },
    ],
  },

  modulos: {
    nucleo: {
      automatizaciones: true,
      actividades: true,
      plantillas: true,
      push: true,
      reportes: true,
      simulador: true,
      laboratorio: true,
    },
    activos: modulos.activos,
  },
});
