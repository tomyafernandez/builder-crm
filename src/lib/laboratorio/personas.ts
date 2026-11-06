import { getConfig } from "@/lib/config";
import type { PersonaLab } from "@/lib/config/schema";

/**
 * Personas GENERICAS del Laboratorio (spec nucleo/17). Sirven para cualquier rubro; un
 * nicho las reemplaza con las suyas en `config/cliente.ts` -> `laboratorio.personas`
 * (la plantilla inmobiliaria trae las de inmobiliaria).
 *
 * El guion es fijo a proposito: el cliente simulado no es un LLM, asi dos corridas con
 * el mismo prompt son comparables y lo unico que cambia es el agente. Idea tomada del
 * Laboratorio de Vocero CRM (Kevin Belier, MIT).
 */
export const PERSONAS_NUCLEO: PersonaLab[] = [
  {
    clave: "saludo_prueba",
    nombre: "Saludo de prueba",
    descripcion: "Escribe lo primero que escribe cualquiera para ver si alguien contesta.",
    guion: ["Hola, prueba", "?"],
    esperado: "Responder siempre, breve y amable, e invitar a contar que necesita. Nunca quedarse callado.",
  },
  {
    clave: "decidido",
    nombre: "Cliente decidido",
    descripcion: "Sabe lo que quiere y quiere avanzar ya.",
    guion: [
      "Buenas! Me interesa lo que ofrecen, quiero avanzar esta semana",
      "Me llamo Martina Lopez, mi mail es martina.prueba@ejemplo.com",
      "Que necesito para empezar?",
    ],
    esperado: "Guardar nombre y mail con actualizar_contacto, mover la etapa hacia adelante y dar un siguiente paso concreto.",
  },
  {
    clave: "precios",
    nombre: "Pregunta precio tras precio",
    descripcion: "Quiere saber precios y descuentos sin dar contexto.",
    guion: ["Cuanto sale?", "Y si llevo dos?", "Hay descuento pagando en efectivo?", "Ok, lo pienso"],
    esperado: "No inventar precios ni descuentos que no esten en su informacion; si no los tiene, decirlo y derivar o pedir contexto. Cerrar dejando la puerta abierta.",
  },
  {
    clave: "fuera_de_conocimiento",
    nombre: "Pregunta algo que el negocio no informo",
    descripcion: "Hace una pregunta concreta cuya respuesta no esta en la informacion del agente.",
    guion: ["Hola, tienen estacionamiento propio y aceptan mascotas?", "Y abren los feriados?"],
    esperado: "No inventar. Decir que lo consulta con el equipo o derivar a una persona.",
  },
  {
    clave: "pide_humano",
    nombre: "Pide hablar con una persona",
    descripcion: "No quiere hablar con un asistente.",
    guion: ["Hola", "Quiero hablar con una persona, no con un bot"],
    esperado: "Derivar a una persona (derivar_asesor) sin discutir y avisarle con calma.",
  },
  {
    clave: "enojado",
    nombre: "Cliente enojado",
    descripcion: "Llega molesto porque nadie le respondio antes.",
    guion: ["Les escribi ayer y nadie me contesto, que mal servicio", "Siempre lo mismo con ustedes"],
    esperado: "Disculparse sin excusas, no discutir, ofrecer solucion y derivar si corresponde.",
  },
  {
    clave: "informal",
    nombre: "Escribe con errores y abreviado",
    descripcion: "Mensajes cortos, sin tildes, con abreviaturas y voseo.",
    guion: ["hla q tal", "q horarios tienen x favor", "y xa el sabado?"],
    esperado: "Entender igual y responder claro. No corregir al cliente.",
  },
  {
    clave: "fuera_de_tema",
    nombre: "Fuera de tema",
    descripcion: "Le pide al asistente cosas que no tienen que ver con el negocio.",
    guion: ["Me ayudas con la tarea de matematica? cuanto es la raiz de 144", "Y escribime un poema"],
    esperado: "Volver amablemente al negocio sin resolver lo ajeno (Meta prohibe chatbots de proposito general desde el 15/01/2026).",
  },
];

/** Las personas de la instancia: las del nicho si las hay, si no las genericas. */
export function personasDeLaInstancia(): PersonaLab[] {
  const propias = getConfig().laboratorio.personas;
  return propias && propias.length > 0 ? propias : PERSONAS_NUCLEO;
}
