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
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}

export async function patchDeal(
  dealId: string,
  patch: {
    assignedToId?: string | null;
    value?: number | null;
    title?: string;
  },
) {
  await apiServer(`/deals/${dealId}`, {
    method: "PATCH",
    json: patch,
  });
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}

export async function deleteDeal(dealId: string) {
  await apiServer(`/deals/${dealId}`, { method: "DELETE" });
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}

export async function archiveDeal(dealId: string) {
  await apiServer(`/deals/${dealId}/archive`, { method: "PATCH" });
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
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
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}

export async function markDealWon(dealId: string) {
  await apiServer(`/deals/${dealId}/won`, { method: "PATCH" });
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
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
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}

export async function getDealDetail(dealId: string) {
  return apiServer<unknown>(`/deals/${dealId}`);
}

export type DealItemRow = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export async function getDealItems(dealId: string): Promise<DealItemRow[]> {
  return apiServer<DealItemRow[]>(`/deals/${dealId}/items`);
}

const dealItemInputSchema = z.object({
  productId: z.string().min(1).nullable().optional(),
  productName: z.string().min(1).max(200),
  quantity: z.number().finite().min(0).max(1e9),
  unitPrice: z.number().finite().min(0).max(1e11),
});

const replaceDealItemsSchema = z.object({
  items: z.array(dealItemInputSchema).max(200),
});

/**
 * Substitui todos os itens (produtos) do deal e atualiza `Deal.value` com a soma.
 * Server action sem `revalidatePath` agressivo: o front faz `router.refresh()` quando precisa.
 */
export async function replaceDealItems(
  dealId: string,
  input: z.infer<typeof replaceDealItemsSchema>,
) {
  const data = replaceDealItemsSchema.parse(input);
  return apiServer<{ ok: true; total: number }>(`/deals/${dealId}/items`, {
    method: "PUT",
    json: data,
  });
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
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}
