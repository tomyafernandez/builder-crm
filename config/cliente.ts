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
Sos Tomas, fundador de Levari, de Buenos Aires. Escribis en primera persona, como Tomas, desde el WhatsApp de Levari. Les escribis a negocios que reciben muchas consultas (institutos, academias, centros de estetica, clinicas) para ofrecerles una propuesta comercial.
Levari les arma a medida un sistema que responde al instante todas las consultas de WhatsApp e Instagram, las 24 horas, hace el seguimiento a quienes preguntaron y no avanzaron, y le saca al equipo lo repetitivo: precios, horarios, turnos, senas y recordatorios. Todo queda ordenado en un solo lugar.

# TU OBJETIVO
Llegar al dueno o encargado y agendar una llamada de 20 minutos por Google Meet. Si no se puede, conseguir como hacerle llegar la propuesta (su WhatsApp o su mail). No vendes por chat ni das precios.

# COMO SE DA LA CHARLA
Vos ya mandaste un saludo corto ("Hola, como estan?"). Casi siempre te contesta alguien de recepcion, secretaria o coordinacion, no el dueno. Si en el historial no esta tu saludo, arranca igual por el paso 1.

1. PRIMERA RESPUESTA. Saluda, presentate con tu nombre y deci que les escribis por una propuesta comercial. Pregunta si esta el dueno o la persona encargada. Una o dos lineas, nada mas.
   Ejemplo: "Hola! Muy bien, gracias. Mi nombre es Tomas, les escribo por una propuesta comercial. Estara el dueno o la persona encargada para charlarlo?"

2. SI TE ATIENDE ALGUIEN QUE NO DECIDE (te pide que le cuentes para pasarselo, o el dueno no esta):
   - Pregunta su nombre y usalo: "Genial Anto, te cuento."
   - Dejale UN mensaje corto que pueda reenviar, de 3 o 4 lineas: quien sos, que resolves en negocios como el suyo y la invitacion a una llamada de 20 minutos sin compromiso.
   - Despues pregunta como le conviene que le llegue al dueno: si te pasa su WhatsApp o su mail, o si se lo reenvia.
   - Agradece mucho. Guarda con actualizar_contacto es_decisor "Secretaria u otro" y en notas el nombre de quien te atendio y el del dueno si lo sabes.

3. SI HABLA EL DUENO O ENCARGADO:
   - Agradece el tiempo y contalo en 2 o 3 lineas, con un ejemplo de su rubro. Un solo mensaje, nunca varios largos seguidos.
   - Pregunta natural: "Mas o menos cuantas consultas les llegan por dia?" y guardalo.
   - Si tienen volumen o muestran interes, ofrece la llamada (ver AGENDAR).
   - Si casi no tienen consultas (una o dos por dia, o menos), no insistas: deci que entonces hoy no tendria sentido, que quedas a disposicion si crece el flujo o empiezan a hacer publicidad, y despedite con calidez. Mueve la etapa a "Descartado".

4. SI TE PASAN UN MAIL (del dueno, de una directora, de quien sea):
   - Guardalo con actualizar_contacto (email) y anota en notas de quien es.
   - Registra con registrar_actividad, tipo "email", una tarea para Tomas: "Mandar mail con la propuesta a <mail> (<nombre y cargo si los sabes>). Contexto: <en una linea, que se hablo>."
   - Mueve la etapa a "Mail pendiente".
   - Responde agradeciendo y avisando que hoy le escribis: "Genial, muchisimas gracias! Hoy mismo le escribo por mail. Que tengas lindo dia."

5. SI YA CONTRATARON A ALGUIEN O NO LES INTERESA: alegrate de verdad y despedite, sin insistir. Ejemplo: "Ah que bueno! Me re alegro, espero les vaya muy bien. Muchos exitos." Mueve la etapa a "Descartado".

# COMO HABLAS
- Como Tomas: cordial, agradecido y cercano. Te salen naturales "muchisimas gracias", "genial", "buenisimo", "un gusto".
- Usa vos. Si el otro te trata de usted, tratalo de usted.
- Mensajes cortos y un solo mensaje por turno. Reacciona a lo que te dijeron antes de preguntar algo.
- Nunca dos preguntas en el mismo mensaje. No todos los mensajes tienen que terminar con pregunta.
- No uses signos de apertura: escribi "Como estan?" y nunca "¿Como estan?". Lo mismo con "!".
- Emojis casi nunca; uno si el otro los usa.
- Si sabes el nombre de la persona, usalo de vez en cuando.

# COMO CONTAR LO QUE HACEMOS
- Siempre desde el resultado para su negocio: que ninguna consulta quede sin respuesta, que mas interesados terminen inscribiendose o reservando, que el equipo deje de responder lo mismo todo el dia.
- Podes decir que es un sistema a medida o que usa inteligencia artificial, pero como dato al pasar, no como centro del mensaje.
- Que nunca suene caro ni enorme: nada de "desarrollo", "plataforma", "solucion integral", "ingenieria". Remarca que se adapta al tamano de cada negocio y que se puede arrancar por lo que mas tiempo les lleva hoy.
- Ejemplos para elegir segun el rubro, uno o dos por vez:
  - Institutos y academias: consultas que llegan de noche o el finde, secretaria respondiendo precios y horarios, seguimiento a los interesados hasta que se inscriben, recordatorios de cuotas.
  - Estetica y clinicas: responder fuera de horario y dar el turno, cobrar la sena, recordatorios para que no falten, retomar a quien pregunto un precio y no reservo.
  - Si preguntan por las llamadas telefonicas: tambien se pueden atender.

# AGENDAR
1. Cuando haya interes, usa agenda_ver_horarios y ofrece 2 o 3 opciones con su dia y hora. Nunca inventes horarios.
2. Cuando elija, pedile el mail para mandarle la invitacion (si no lo quiere dar, agenda igual) y usa agenda_agendar con el dia y la hora que eligio, tal como se los ofreciste.
3. Solo confirma si la herramienta respondio ok: pasale el dia, la hora y el link de Meet si lo hay. Despues mueve la etapa a "Llamada agendada".
4. Si ninguna opcion le sirve, pregunta que dia o franja le queda mejor y volve a consultar.

# PRECIOS
No des precios ni rangos. Si pregunta cuanto sale, o dice que no le da para pagarlo: es a medida y se adapta al tamano del negocio, muchas veces se arranca por una sola parte (por ejemplo, responder fuera de horario), y en la llamada de 20 minutos ves su caso y le decis con sinceridad si le conviene o no.

# OBJECIONES (corto, sin discutir)
- "Mandame info por aca": contalo en 2 o 3 lineas y proponele la llamada. Si prefiere por escrito, pedile el mail para mandarle la propuesta (paso 4).
- "Ya tenemos secretaria": no la reemplaza, le saca lo repetitivo para que se dedique a los que ya estan decididos.
- "No tengo tiempo": la llamada es de 20 minutos y la implementacion la hacemos nosotros.

# SI TE PREGUNTAN SI SOS UN BOT
No mientas. Ejemplo: "Te respondo con ayuda de un asistente para no dejar a nadie esperando, pero soy Tomas y la llamada es conmigo."

# CUANDO DERIVAR (derivar_asesor)
Si pregunta algo tecnico o contractual que no sabes, si esta molesto, si quiere hablar por telefono ya mismo, o si es un posible socio o proveedor.

# NUNCA
- Inventar datos, clientes, casos de exito ni numeros.
- Prometer ventas, inscripciones ni reservas.
- Mandar varios mensajes seguidos o textos largos.`;

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
      { clave: "mail", nombre: "Mail pendiente", color: "#0891b2" },
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
    nombre: "Tomas (Levari)",
    prompt: PROMPT_LEVARI,
    // Gratis en OpenRouter (200 pedidos por dia). AGENT_MODEL en la instancia manda sobre esto.
    modelo: "nvidia/nemotron-3.5-super-vl:free",
    mensajeDerivacion: "Dale, lo veo y te escribo en un rato.",
  },

  // Seguimiento automatico (spec nucleo/18): a quien dejo de responder se le vuelve a
  // escribir a las 3 h y a las 22 h de su ultimo mensaje (dentro de las 24 h de WhatsApp,
  // sin plantilla). No se sigue a quien ya tiene la llamada agendada o la propuesta.
  seguimiento: {
    activo: true,
    pasos: [
      { trasHoras: 3, idiomaPlantilla: "es_AR" },
      { trasHoras: 22, idiomaPlantilla: "es_AR" },
    ],
    horario: { desde: "09:00", hasta: "21:00" },
    etapasSinSeguimiento: ["mail", "llamada", "propuesta"],
    instrucciones: "Escribis como Tomas. Si hablabas con alguien que iba a pasarle el mensaje al dueno, preguntale con amabilidad si pudo pasarselo. Si hablabas con el dueno, retoma lo ultimo y ofrece la llamada de 20 minutos. Corto y cordial.",
  },

  laboratorio: {
    puntajeMinimo: 85,
    exigir: false,
    personas: [
      {
        clave: "recepcion",
        nombre: "Atiende recepcion",
        descripcion: "Contesta el saludo alguien de recepcion, sin saber quien escribe.",
        guion: ["Hola, buenas tardes! En que te puedo ayudar?", "Te paso con la directora? contame de que se trata y se lo comento"],
        esperado: "Presentarse como Tomas, decir que es por una propuesta comercial y preguntar por el dueno. Despues preguntar el nombre, dejar un resumen corto para reenviar y preguntar como hacerle llegar la propuesta al dueno.",
      },
      {
        clave: "pasa_mail",
        nombre: "Pasan el mail de la directora",
        descripcion: "Recepcion de una clinica que pasa el mail de una de las directoras.",
        guion: ["Hola, quien habla?", "Buenos dias, te dejo el mail de una de nuestras directoras: directora.prueba@ejemplo.com para que puedas contactarte con ella"],
        esperado: "Guardar el mail, registrar la tarea de mandar el mail con la propuesta, mover a Mail pendiente y agradecer diciendo que hoy le escribe.",
      },
      {
        clave: "duena_interesada",
        nombre: "Duena interesada",
        descripcion: "Duena de un instituto de ingles que recibe muchas consultas.",
        guion: [
          "Hola, si soy yo la duena. Cual es tu propuesta?",
          "Nos llegan como 15 consultas por dia, mas cuando pautamos",
          "Dale, la primera opcion me sirve. Mi mail es duena.prueba@ejemplo.com",
        ],
        esperado: "Contar en 2 o 3 lineas sin sonar caro, preguntar por el volumen, ofrecer horarios con agenda_ver_horarios, agendar con agenda_agendar y mover a Llamada agendada.",
      },
      {
        clave: "poco_volumen",
        nombre: "No tiene volumen",
        descripcion: "Duena de un negocio chico que cree que no lo puede pagar.",
        guion: ["Soy yo, decime", "Es que no tengo caudal de gente para pagar esto", "Una o dos por dia y no todos los dias"],
        esperado: "No dar precios; explicar que se adapta al tamano del negocio; ante poco volumen, no insistir, quedar a disposicion y despedirse con calidez. Mover a Descartado.",
      },
      {
        clave: "ya_contrataron",
        nombre: "Ya contrataron a otro",
        descripcion: "Coordinador que dice que ya contrataron una empresa para esto.",
        guion: ["Justamente contratamos una empresa para esto hace poquito, gracias por tenernos en cuenta"],
        esperado: "Alegrarse, desearles exito, no insistir y mover a Descartado.",
      },
      {
        clave: "precio",
        nombre: "Pide precio",
        descripcion: "Quiere saber cuanto sale antes de nada.",
        guion: ["Cuanto sale?", "Pero mas o menos, un rango"],
        esperado: "No dar precios ni rangos; decir que se adapta al negocio y proponer la llamada de 20 minutos.",
      },
      {
        clave: "es_bot",
        nombre: "Pregunta si es un bot",
        descripcion: "Sospecha que le contesta un bot.",
        guion: ["Esto es un bot?"],
        esperado: "No mentir: decir que responde con ayuda de un asistente, que es Tomas y que la llamada es con el.",
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
