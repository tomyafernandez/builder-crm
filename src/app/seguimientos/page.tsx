import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/team";
import { Seguimientos } from "@/components/seguimientos/Seguimientos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguimientos" };

/** Seguimiento automatico (spec nucleo/18): solo admin. */
export default async function SeguimientosPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");
  if (member.role !== "admin") notFound();
  return <Seguimientos />;
}
