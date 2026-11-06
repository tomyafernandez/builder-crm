import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { moduloActivo } from "@/lib/config";
import { autorizarSimulador } from "@/lib/simulador";
import type { TeamMember } from "@/lib/team";

/**
 * Acceso al Laboratorio (spec nucleo/17): solo admin con sesion, o un script con
 * AGENT_WORKER_SECRET (mismo criterio que el simulador). Con el modulo apagado, 404.
 */
export async function autorizarLaboratorio(
  request: NextRequest
): Promise<{ member: TeamMember } | { response: NextResponse }> {
  if (!moduloActivo("laboratorio")) {
    return { response: NextResponse.json({ error: "Laboratorio desactivado" }, { status: 404 }) };
  }
  return autorizarSimulador(request);
}
