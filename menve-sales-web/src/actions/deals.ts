"use server";

import { ActivityType } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function moveDealStage(dealId: string, stageId: string) {
  await apiServer(`/deals/${dealId}/stage`, {
    method: "PATCH",
    json: { stageId },
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
  const data = dealSchema.parse(input);
  await apiServer("/deals", {
    method: "POST",
    json: data,
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}

export async function markDealWon(dealId: string) {
  await apiServer(`/deals/${dealId}/won`, { method: "PATCH" });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}

const lostSchema = z.object({
  dealId: z.string(),
  lostReason: z.string().min(2, "Motivo obrigatório").max(500),
});

export async function markDealLost(dealId: string, lostReason: string) {
  const parsed = lostSchema.parse({ dealId, lostReason });
  await apiServer(`/deals/${parsed.dealId}/lost`, {
    method: "PATCH",
    json: { lostReason: parsed.lostReason.trim() },
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}

export async function getDealDetail(dealId: string) {
  return apiServer<unknown>(`/deals/${dealId}`);
}

const activitySchema = z.object({
  dealId: z.string(),
  contactId: z.string(),
  type: z.nativeEnum(ActivityType),
  title: z.string().min(1),
  description: z.string().optional(),
});

export async function createDealActivity(input: z.infer<typeof activitySchema>) {
  const data = activitySchema.parse(input);
  await apiServer("/activities", {
    method: "POST",
    json: {
      dealId: data.dealId,
      contactId: data.contactId,
      type: data.type,
      title: data.title,
      description: data.description,
    },
  });
  revalidatePath("/pipeline");
  revalidatePath("/contacts", "layout");
}
