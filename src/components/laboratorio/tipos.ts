export interface ResumenCorrida {
  id: string;
  channel: string;
  estado: string;
  puntaje: number | null;
  modelo: string | null;
  modeloJuez: string | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  total: number;
  hechos: number;
}

export interface Hallazgo {
  tipo: string;
  evidencia: string;
  sugerencia?: { pregunta: string; respuesta: string } | null;
}

export interface Caso {
  id: string;
  orden: number;
  personaClave: string;
  personaNombre: string;
  persona: { descripcion?: string; esperado?: string; guion?: string[] };
  estado: string;
  veredicto: "verde" | "amarillo" | "rojo" | null;
  hallazgos: Hallazgo[] | null;
  resumen: string | null;
  transcripcion: Array<{ rol: "cliente" | "agente" | "persona"; texto: string }> | null;
  estadoFinal: Record<string, unknown> | null;
  error: string | null;
}

export interface DetalleCorrida extends ResumenCorrida {
  puntajeAnterior: number | null;
  casos: Caso[];
}

export const ETIQUETA_HALLAZGO: Record<string, string> = {
  no_respondio: "No respondio",
  alucinacion: "Invento un dato",
  fuera_de_conocimiento: "Improviso sin informacion",
  debio_derivar: "Debio derivar",
  tono: "Tono",
  dato_no_guardado: "No guardo un dato",
  fuera_de_tema: "Fuera de tema",
};
