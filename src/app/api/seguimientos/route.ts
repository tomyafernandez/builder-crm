import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { resumenSeguimientos } from "@/lib/seguimiento/motor";

export const dynamic = "force-dynamic";

/** Panel del seguimiento automatico (solo admin). */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await resumenSeguimientos(30));
}
