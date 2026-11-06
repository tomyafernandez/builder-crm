import { NextRequest, NextResponse } from "next/server";
import { autorizarLaboratorio } from "@/lib/laboratorio/api";
import { avanzarCorrida } from "@/lib/laboratorio/motor";

export const dynamic = "force-dynamic";
// Un paso es un turno del agente (5-30 s) o el juicio de un caso.
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizarLaboratorio(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const r = await avanzarCorrida(id);
  if (!r) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(r);
}
