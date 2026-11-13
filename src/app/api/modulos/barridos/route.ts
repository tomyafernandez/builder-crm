import { NextRequest, NextResponse } from "next/server";
import { autorizadoPorSecreto } from "@/lib/secreto-worker";
import { correrBarridosDeModulos } from "@/lib/modules/barridos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Barrido de los modulos activos (spec nucleo/19). Lo llama el cron con el secreto. */
export async function GET(request: NextRequest) {
  if (!autorizadoPorSecreto(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await correrBarridosDeModulos();
  return NextResponse.json({ ok: true, modulos: r });
}
