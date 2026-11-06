import { NextRequest, NextResponse } from "next/server";
import { autorizarLaboratorio } from "@/lib/laboratorio/api";
import { cancelarCorrida, obtenerCorrida } from "@/lib/laboratorio/motor";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizarLaboratorio(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const corrida = await obtenerCorrida(id);
  if (!corrida) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(corrida);
}

/** Cancela una corrida en curso y borra sus contactos de prueba. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autorizarLaboratorio(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const ok = await cancelarCorrida(id);
  return NextResponse.json({ ok });
}
