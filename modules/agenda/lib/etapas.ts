import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, pipelineStages, pipelines } from "@/db/schema";
import { setDealStage } from "@/lib/deals/stage";

/**
 * Mueve la operacion abierta del contacto a la etapa de CLAVE dada, si esa etapa existe en
 * el pipeline por defecto (spec nucleo/19: `sena_pendiente`, `turno_confirmado`). Si el
 * pipeline no la tiene, no hace nada: la agenda sirve igual en una instancia sin esas
 * etapas. Pasa por `setDealStage`, el unico camino que avisa a las automatizaciones.
 */
export async function moverEtapaPorClave(
  contactId: string,
  clave: string,
  opciones: { valorCentavos?: number | null; motivo?: string } = {}
): Promise<boolean> {
  const [pipeline] = await db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  if (!pipeline) return false;
  const [etapa] = await db
    .select({ id: pipelineStages.id, name: pipelineStages.name })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.pipelineId, pipeline.id), eq(pipelineStages.key, clave)))
    .limit(1);
  if (!etapa) return false;

  const [abierta] = await db
    .select({ id: deals.id, stageId: deals.stageId })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(
      and(
        eq(deals.contactId, contactId),
        eq(pipelineStages.pipelineId, pipeline.id),
        eq(pipelineStages.isWon, false),
        eq(pipelineStages.isLost, false)
      )
    )
    .orderBy(desc(deals.updatedAt))
    .limit(1);

  if (abierta) {
    if (opciones.valorCentavos) {
      await db.update(deals).set({ value: opciones.valorCentavos, updatedAt: new Date() }).where(eq(deals.id, abierta.id));
    }
    if (abierta.stageId !== etapa.id) await setDealStage({ dealId: abierta.id, stageId: etapa.id });
  } else {
    const [contacto] = await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
    const [nueva] = await db
      .insert(deals)
      .values({ title: contacto?.name ?? "Turno", stageId: etapa.id, contactId, value: opciones.valorCentavos ?? 0 })
      .returning({ id: deals.id });
    await setDealStage({ dealId: nueva.id, stageId: etapa.id, justCreated: true });
  }
  await db.insert(activities).values({
    type: "note",
    description: `Agenda movio la operacion a "${etapa.name}"${opciones.motivo ? `: ${opciones.motivo}` : ""}`,
    contactId,
  });
  return true;
}
