import { NextRequest, NextResponse } from "next/server";
import { isChannel } from "@/lib/channels/types";
import { autorizarLaboratorio } from "@/lib/laboratorio/api";
import { aplicarSugerencia } from "@/lib/laboratorio/motor";

export const dynamic = "force-dynamic";

/**
 * Agrega una pregunta frecuente al prompt del agente. La respuesta la escribe o corrige
 * una persona: si todavia dice [COMPLETAR ...] se rechaza, para que nunca entre al
 * agente un dato que invento el juez.
 */
export async function POST(request: NextRequest) {
  const auth = await autorizarLaboratorio(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as
    | { channel?: unknown; pregunta?: unknown; respuesta?: unknown }
    | null;
  const channel = isChannel(body?.channel) ? body.channel : "whatsapp";
  const pregunta = typeof body?.pregunta === "string" ? body.pregunta.trim().slice(0, 300) : "";
  const respuesta = typeof body?.respuesta === "string" ? body.respuesta.trim().slice(0, 800) : "";
  if (pregunta.length < 3 || respuesta.length < 2) {
    return NextResponse.json({ error: "Pregunta y respuesta son obligatorias" }, { status: 400 });
  }
  if (/\[COMPLETAR/i.test(respuesta)) {
    return NextResponse.json(
      { error: "Completa el dato real del negocio donde dice [COMPLETAR] antes de agregarlo." },
      { status: 400 }
    );
  }
  const r = await aplicarSugerencia({ channel, pregunta, respuesta });
  return NextResponse.json({ ok: true, ...r });
}
