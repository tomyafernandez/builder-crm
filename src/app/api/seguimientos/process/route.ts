import { NextRequest, NextResponse } from "next/server";
import { autorizadoPorSecreto } from "@/lib/secreto-worker";
import { correrSeguimientos } from "@/lib/seguimiento/motor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Barrido del seguimiento automatico (spec nucleo/18). Lo llama el cron con el secreto. */
export async function GET(request: NextRequest) {
  if (!autorizadoPorSecreto(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await correrSeguimientos();
  return NextResponse.json({ ok: true, revisadas: r.revisadas, enviados: r.enviados, errores: r.errores });
}
