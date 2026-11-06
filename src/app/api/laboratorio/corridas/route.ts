import { NextRequest, NextResponse } from "next/server";
import { isChannel } from "@/lib/channels/types";
import { autorizarLaboratorio } from "@/lib/laboratorio/api";
import { iniciarCorrida } from "@/lib/laboratorio/motor";

export const dynamic = "force-dynamic";

/** Arranca una corrida. La pantalla despues la avanza de a un paso. */
export async function POST(request: NextRequest) {
  const auth = await autorizarLaboratorio(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { channel?: unknown } | null;
  const channel = isChannel(body?.channel) ? body.channel : "whatsapp";
  const r = await iniciarCorrida({ channel, creadoPor: auth.member.id });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json(r, { status: 201 });
}
