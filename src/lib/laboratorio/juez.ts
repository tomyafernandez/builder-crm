import { z } from "zod";
import type { PersonaLab } from "@/lib/config/schema";

/**
 * El juez del Laboratorio (spec nucleo/17): otro modelo lee la conversacion completa y
 * devuelve un veredicto estructurado. Este archivo es PURO (sin red ni base) para poder
 * probarlo: arma el pedido, interpreta la respuesta y calcula el puntaje.
 */

export const TIPOS_HALLAZGO = [
  "no_respondio",
  "alucinacion",
  "fuera_de_conocimiento",
  "debio_derivar",
  "tono",
  "dato_no_guardado",
  "fuera_de_tema",
] as const;

export const esquemaVeredicto = z.object({
  veredicto: z.enum(["verde", "amarillo", "rojo"]),
  resumen: z.string().max(600).default(""),
  hallazgos: z
    .array(
      z.object({
        tipo: z.enum(TIPOS_HALLAZGO),
        evidencia: z.string().max(600),
        sugerencia: z
          .object({ pregunta: z.string().max(300), respuesta: z.string().max(800) })
          .nullish(),
      })
    )
    .max(10)
    .default([]),
});

export type Veredicto = z.infer<typeof esquemaVeredicto>;

export interface TurnoTranscripcion {
  rol: "cliente" | "agente" | "persona";
  texto: string;
}

export const SISTEMA_JUEZ = `Sos un evaluador exigente de asistentes de atencion por mensajeria para negocios.
Te paso: la INFORMACION Y REGLAS que recibio el asistente, el TIPO DE CLIENTE simulado, lo ESPERADO, la CONVERSACION y lo que el asistente dejo registrado en el CRM.

Evalua SOLO al asistente. Criterios:
- no_respondio: un mensaje del cliente quedo sin respuesta, o respondio vacio.
- alucinacion: afirmo un dato (precio, horario, stock, condicion, politica) que NO esta en su informacion.
- fuera_de_conocimiento: le preguntaron algo que no esta en su informacion y en vez de decirlo o derivar, improviso.
- debio_derivar: el cliente pidio una persona, estaba enojado o la consulta lo superaba, y no derivo.
- tono: frio, robotico, largo de mas, insistente, corrigio al cliente o dijo que es una IA.
- dato_no_guardado: el cliente dio un dato util (nombre, mail, que busca) y no quedo en el CRM.
- fuera_de_tema: resolvio pedidos ajenos al negocio en vez de volver al tema.

Veredicto: "verde" = atenderia bien a un cliente real; "amarillo" = errores menores; "rojo" = perderia al cliente o dijo algo falso.
Si un hallazgo se arregla agregando informacion, proponela en "sugerencia" como pregunta y respuesta. En la respuesta NO inventes datos del negocio: si no los sabes, escribi [COMPLETAR: que dato falta].

Responde SOLO un objeto JSON, sin texto alrededor:
{"veredicto":"verde|amarillo|rojo","resumen":"una o dos frases","hallazgos":[{"tipo":"...","evidencia":"cita breve de la conversacion","sugerencia":{"pregunta":"...","respuesta":"..."}}]}`;

export function armarPedidoJuez(input: {
  conocimiento: string;
  persona: PersonaLab;
  transcripcion: TurnoTranscripcion[];
  estadoFinal: Record<string, unknown> | null;
}): string {
  const conversacion = input.transcripcion
    .map((t) => `${t.rol === "cliente" ? "CLIENTE" : t.rol === "agente" ? "ASISTENTE" : "PERSONA DEL EQUIPO"}: ${t.texto}`)
    .join("\n");
  return [
    `# INFORMACION Y REGLAS DEL ASISTENTE\n${input.conocimiento.slice(0, 12000)}`,
    `# TIPO DE CLIENTE\n${input.persona.nombre}: ${input.persona.descripcion}`,
    `# ESPERADO\n${input.persona.esperado ?? "Atenderlo bien, sin inventar nada."}`,
    `# CONVERSACION\n${conversacion || "(vacia)"}`,
    `# LO QUE QUEDO EN EL CRM\n${JSON.stringify(input.estadoFinal ?? {}, null, 0).slice(0, 2000)}`,
  ].join("\n\n");
}

/**
 * Interpreta la respuesta del juez con tolerancia: los modelos a veces envuelven el
 * JSON en ```json o agregan una frase. Devuelve null si no hay un veredicto valido.
 */
export function interpretarVeredicto(texto: string | null | undefined): Veredicto | null {
  if (!texto) return null;
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const crudo = JSON.parse(texto.slice(inicio, fin + 1));
    const r = esquemaVeredicto.safeParse(crudo);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * Puntaje 0-100: porcentaje ponderado de casos verdes (verde 1, amarillo 0,5, rojo 0).
 * Los casos que el juez no pudo evaluar quedan FUERA del denominador: no cuentan ni a
 * favor ni en contra. null si no hay ningun caso evaluado.
 */
export function calcularPuntaje(casos: Array<{ veredicto: string | null }>): number | null {
  const evaluados = casos.filter((c) => c.veredicto === "verde" || c.veredicto === "amarillo" || c.veredicto === "rojo");
  if (evaluados.length === 0) return null;
  const puntos = evaluados.reduce((acc, c) => acc + (c.veredicto === "verde" ? 1 : c.veredicto === "amarillo" ? 0.5 : 0), 0);
  return Math.round((100 * puntos) / evaluados.length);
}

/** Un caso donde el agente no contesto ningun mensaje es rojo sin preguntarle a nadie. */
export function veredictoSinRespuesta(transcripcion: TurnoTranscripcion[]): Veredicto | null {
  const respondio = transcripcion.some((t) => t.rol === "agente" && t.texto.trim());
  if (respondio) return null;
  return {
    veredicto: "rojo",
    resumen: "El asistente no respondio ningun mensaje.",
    hallazgos: [{ tipo: "no_respondio", evidencia: transcripcion[0]?.texto ?? "", sugerencia: null }],
  };
}
