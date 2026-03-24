"use server";

import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function moveDealStage(dealId: string, stageId: string) {
  const tenantId = await getActiveTenantId();
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, tenantId },
    include: { pipeline: { include: { stages: true } } },
  });
  if (!deal) throw new Error("Deal não encontrado");

  const stage = deal.pipeline.stages.find((s) => s.id === stageId);
  if (!stage) throw new Error("Etapa inválida");

  await prisma.deal.update({
    where: { id: dealId },
    data: { stageId },
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}

const dealSchema = z.object({
  contactId: z.string(),
  pipelineId: z.string(),
  stageId: z.string(),
  title: z.string().min(1),
  value: z.number().optional(),
});

export async function createDeal(input: z.infer<typeof dealSchema>) {
  const tenantId = await getActiveTenantId();
  const data = dealSchema.parse(input);
  await prisma.deal.create({
    data: {
      tenantId,
      contactId: data.contactId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      title: data.title,
      value: data.value,
    },
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}

export async function markDealWon(dealId: string) {
  const tenantId = await getActiveTenantId();
  await prisma.deal.updateMany({
    where: { id: dealId, tenantId },
    data: { status: "WON", lostReason: null },
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}

const lostSchema = z.object({
  dealId: z.string(),
  lostReason: z.string().min(2, "Motivo obrigatório").max(500),
});

export async function markDealLost(dealId: string, lostReason: string) {
  const tenantId = await getActiveTenantId();
  const parsed = lostSchema.parse({ dealId, lostReason });
  await prisma.deal.updateMany({
    where: { id: parsed.dealId, tenantId },
    data: { status: "LOST", lostReason: parsed.lostReason.trim() },
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}
