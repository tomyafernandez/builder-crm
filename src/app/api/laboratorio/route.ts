import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { hasOpenRouterKey, getAgentModel, getJudgeModel } from "@/lib/agent/openrouter";
import { autorizarLaboratorio } from "@/lib/laboratorio/api";
import { listarCorridas } from "@/lib/laboratorio/motor";
import { personasDeLaInstancia } from "@/lib/laboratorio/personas";

export const dynamic = "force-dynamic";

/** Panel del Laboratorio: corridas, personas de la instancia y umbral. */
export async function GET(request: NextRequest) {
  const auth = await autorizarLaboratorio(request);
  if ("response" in auth) return auth.response;
  const { puntajeMinimo, exigir } = getConfig().laboratorio;
  return NextResponse.json({
    corridas: await listarCorridas(),
    personas: personasDeLaInstancia(),
    puntajeMinimo,
    exigir,
    hayClave: hasOpenRouterKey(),
    modelo: getAgentModel(),
    modeloJuez: getJudgeModel(),
  });
}
