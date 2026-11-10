import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { correrSeguimientos } from "@/lib/seguimiento/motor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Correr ahora" desde el panel. Con { prueba: true } solo toca conversaciones del
 * simulador y no espera las horas configuradas: sirve para ver el seguimiento en una
 * demo sin escribirle a nadie real.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { prueba?: boolean };
  const prueba = body.prueba === true;
  const r = await correrSeguimientos({ soloSimulador: prueba, ignorarEspera: prueba });
  return NextResponse.json(r);
}
