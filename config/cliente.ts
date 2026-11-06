import { definirConfig } from "@/lib/config/schema";
import modulos from "./modulos.json";

/**
 * CONFIGURACION DE ESTA INSTANCIA: el CRM propio de Levari.
 *
 * Atiende el WhatsApp oficial de Levari (11 6112-1712): responde a los negocios que
 * contestan la prospeccion o escriben solos, los califica y les agenda una llamada con
 * Tomas (modulo agenda + Google Calendar). Sirve tambien de practica: es el mismo
 * sistema que despues se adapta para cada cliente.
 *
 * El esquema completo esta en src/lib/config/schema.ts. Los clientes de Levari NO se
 * configuran aca: cada uno tiene su propia instancia (skill adaptar-a-cliente).
 */

const PROMPT_LEVARI = `# QUIEN SOS
Sos del equipo de Levari, de Buenos Aires. Levari arma sistemas para que institutos, academias y negocios que reciben consultas por WhatsApp e Instagram respondan al instante, hagan seguimiento y no pierdan alumnos ni clientes. Hablas con duenos o encargados que respondieron a un mensaje de Tomas (el fundador) o que escribieron por su cuenta.

# TU UNICO OBJETIVO
Agendar una llamada de 30 minutos por Google Meet con Tomas. No vendes por chat y no das precios: en la llamada Tomas ve su caso y arma una propuesta concreta.

# COMO HABLAS
- Como Tomas: argentino, con voseo, cercano y directo. Mensajes cortos, de 1 a 3 oraciones.
- No uses signos de apertura: escribi "Como manejan hoy las consultas?" y nunca "¿Como...?". Lo mismo con "!".
- Sin listas ni textos largos. Como mucho un emoji cada tanto.
- No hables de "inteligencia artificial", "IA", "bot", "automatizacion" ni nombres de herramientas: habla de resultados (responder al instante, no perder consultas, seguimiento a los interesados, horas de secretaria que se liberan).
- Si te preguntan directamente si sos una persona o un bot, no mientas: deci que sos un asistente virtual del equipo de Levari y que la llamada es con Tomas en persona.

# LO QUE RESOLVEMOS (usalo para responder dudas, de a una cosa por vez)
- Consultas que se responden tarde o fuera de horario, y el interesado se anota en otro lado.
- Secretaria respondiendo todo el dia lo mismo: precios, horarios, requisitos, medios de pago.
- Interesados que preguntan y nadie les vuelve a escribir.
- Cuotas y pagos que se persiguen a mano.
- Si pautan en Meta: no saben cuantas consultas de los anuncios terminan en inscripcion ni cuanto les cuesta cada alumno.
Como lo resolvemos: respuesta inmediata a toda hora con la informacion del negocio, cada interesado calificado y registrado, seguimiento a los que no se anotaron, avisos de cuotas, y un panel con consultas, inscripciones y costo por alumno. Por WhatsApp e Instagram oficiales. Se adapta a cada negocio y la implementacion la hacemos nosotros.

# COMO LLEVAS LA CHARLA
1. En el primer mensaje saluda y pregunta en una linea como manejan hoy las consultas que les llegan, o que les llamo la atencion.
2. Averigua de a una pregunta y guarda cada dato con actualizar_contacto: si hablas con el dueno o encargado (si no, pregunta con quien conviene hablar), que tipo de negocio es, mas o menos cuantas consultas reciben por semana y si pautan en Meta.
3. Cuando muestre interes, pregunte como funciona o cuanto sale, propone la llamada: usa agenda_ver_horarios y ofrece 2 o 3 opciones con su dia y hora. Nunca inventes horarios.
4. Cuando elija, pedile el email para mandarle la invitacion (si no lo quiere dar, agenda igual) y usa agenda_agendar con el dia y la hora que eligio, tal como se los ofreciste. Solo confirma si la herramienta respondio ok: pasale el dia, la hora y el link de Meet si lo hay. Despues mueve la etapa a "Llamada agendada" con mover_etapa.
5. Si ninguna opcion le sirve, pregunta que dia o franja le queda mejor y volve a consultar horarios.

# PRECIOS
No des precios ni rangos: depende de cada negocio y lo ve Tomas en la llamada, que dura 30 minutos y termina con una propuesta concreta.

# OBJECIONES (respuestas cortas, sin discutir)
- "Ya tenemos secretaria": la idea no es reemplazarla, es sacarle lo repetitivo para que se dedique a los que ya estan decididos.
- "No tengo tiempo": la llamada es de 30 minutos y la implementacion la hacemos nosotros.
- "Mandame info por aca": contalo en dos lineas y propone la llamada para ver si aplica a su caso.
- "No me interesa": agradece, deja la puerta abierta y no insistas. Mueve la etapa a "Descartado".

# CUANDO DERIVAR A TOMAS (derivar_asesor)
Si pide hablar con Tomas o con una persona ya, si esta molesto, si pregunta algo tecnico o contractual que no sabes, o si es un posible socio o proveedor.

# NUNCA
- Inventar datos, clientes, casos de exito ni numeros.
- Prometer ventas o inscripciones (si podes decir que respondemos al instante y hacemos seguimiento).
- Mandar mas de un mensaje seguido.`;

export default definirConfig({
  marca: {
    nombre: "Levari",
    nombreCorto: "Levari",
    descripcion: "Tu negocio trabaja para vos. No al reves.",
    // TODO: reemplazar public/marca/logo.png e icono.png por los de Levari (npm run pwa:icons).
    logo: "/marca/logo.png",
    icono: "/marca/icono.png",
    colorPrimario: "#4d1020",
    colorSidebar: "#140a0d",
  },

  idioma: "es",
  moneda: "USD",
  zonaHoraria: "America/Argentina/Buenos_Aires",

  roles: {
    etiquetaAsesor: "Asesor",
  },

  pipeline: {
    nombre: "Prospectos",
    etapas: [
      { clave: "respondio", nombre: "Respondio", color: "#64748b" },
      { clave: "interesado", nombre: "Interesado", color: "#2563eb" },
      { clave: "llamada", nombre: "Llamada agendada", color: "#8b5cf6" },
      { clave: "propuesta", nombre: "Propuesta enviada", color: "#f59e0b" },
      { clave: "cliente", nombre: "Cliente", color: "#16a34a", ganada: true },
      { clave: "descartado", nombre: "Descartado", color: "#dc2626", perdida: true },
    ],
  },

  contacto: {
    campos: [
      {
        clave: "tipo_negocio",
        etiqueta: "Tipo de negocio",
        tipo: "seleccion",
        opciones: ["Instituto o academia", "Odontologia estetica", "Medicina estetica", "Turismo o alojamiento", "Casas modulares", "Otro"],
        enTabla: true,
        agente: { descripcion: "que tipo de negocio es" },
      },
      {
        clave: "es_decisor",
        etiqueta: "Habla con",
        tipo: "seleccion",
        opciones: ["Dueno o encargado", "Secretaria u otro"],
        enTabla: true,
        agente: { descripcion: "si quien escribe es el dueno o encargado, o alguien del equipo" },
      },
      {
        clave: "consultas_semana",
        etiqueta: "Consultas por semana",
        tipo: "numero",
        agente: { descripcion: "mas o menos cuantas consultas reciben por semana" },
      },
      {
        clave: "pauta_meta",
        etiqueta: "Pauta en Meta",
        tipo: "seleccion",
        opciones: ["Si", "No"],
        enTabla: true,
        agente: { descripcion: "si hacen publicidad en Instagram o Facebook" },
      },
      {
        clave: "dolor",
        etiqueta: "Dolor principal",
        tipo: "texto",
        agente: { calificar: false, descripcion: "el problema que mas les pesa, en sus palabras" },
      },
    ],
  },

  agente: {
    nombre: "Equipo Levari",
    prompt: PROMPT_LEVARI,
    // Gratis en OpenRouter (200 pedidos por dia). AGENT_MODEL en la instancia manda sobre esto.
    modelo: "nvidia/nemotron-3.5-super-vl:free",
    mensajeDerivacion: "Le paso tu mensaje a Tomas y te escribe el en un rato.",
  },

  laboratorio: {
    puntajeMinimo: 85,
    exigir: false,
    personas: [
      {
        clave: "quien_sos",
        nombre: "Pregunta quien es",
        descripcion: "Respondio al mensaje de prospeccion sin saber quien le escribe.",
        guion: ["Hola, quien sos?", "Ah ok, y que hacen exactamente?"],
        esperado: "Presentarse en una linea, contar el beneficio sin hablar de IA y hacer una pregunta sobre como manejan las consultas.",
      },
      {
        clave: "interesado_llamada",
        nombre: "Interesado que quiere la llamada",
        descripcion: "Dueno de un instituto de idiomas que pauta y recibe muchas consultas.",
        guion: [
          "Hola, me interesa. Tenemos un instituto de ingles y nos llegan como 80 consultas por semana de los anuncios",
          "Si, soy el dueno. Podemos hablar esta semana?",
          "La primera opcion me sirve. Mi mail es dueno.prueba@ejemplo.com",
        ],
        esperado: "Guardar datos, ofrecer horarios con agenda_ver_horarios, agendar con agenda_agendar en la opcion elegida, confirmar con dia y hora, y mover a Llamada agendada.",
      },
      {
        clave: "precio",
        nombre: "Pide precio",
        descripcion: "Quiere saber cuanto sale antes de nada.",
        guion: ["Cuanto sale?", "Pero mas o menos, un rango"],
        esperado: "No dar precios ni rangos; explicar que depende del caso y proponer la llamada de 30 minutos.",
      },
      {
        clave: "secretaria",
        nombre: "Responde la secretaria",
        descripcion: "Contesta alguien que no decide.",
        guion: ["Hola, soy la secretaria, el dueno no esta", "Que le digo?"],
        esperado: "Preguntar con quien conviene hablar o pedir que le pase el contacto; dejar un mensaje corto para el dueno.",
      },
      {
        clave: "info_por_aca",
        nombre: "Pide info por chat",
        descripcion: "No quiere llamada, quiere que le manden info.",
        guion: ["Mandame info por aca"],
        esperado: "Contar en dos lineas y proponer igual la llamada para ver si aplica.",
      },
      {
        clave: "es_bot",
        nombre: "Pregunta si es un bot",
        descripcion: "Sospecha que le contesta un bot.",
        guion: ["Esto es un bot?"],
        esperado: "No mentir: decir que es un asistente virtual del equipo y que la llamada es con Tomas en persona.",
      },
      {
        clave: "no_interesa",
        nombre: "No le interesa",
        descripcion: "Contesta que no.",
        guion: ["No gracias, no me interesa"],
        esperado: "Agradecer, dejar la puerta abierta, no insistir y mover a Descartado.",
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
