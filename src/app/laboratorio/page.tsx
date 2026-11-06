import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/team";
import { moduloActivo } from "@/lib/config";
import { Laboratorio } from "@/components/laboratorio/Laboratorio";

export const dynamic = "force-dynamic";

export const metadata = { title: "Laboratorio" };

/** Laboratorio del agente (spec nucleo/17): solo admin, como el simulador. */
export default async function LaboratorioPage() {
  if (!moduloActivo("laboratorio")) notFound();
  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");
  if (member.role !== "admin") notFound();
  return <Laboratorio />;
}
