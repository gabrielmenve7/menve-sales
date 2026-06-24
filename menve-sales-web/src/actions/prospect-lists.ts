"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ProspectListSummary = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  createdBy: { name: string | null; email: string | null };
};

export type ProspectListItemRow = {
  id: string;
  createdAt: string;
  prospectResult: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    website: string | null;
    status: string;
  } | null;
  contact: { id: string; name: string; phone: string | null } | null;
};

export type ProspectListDetail = ProspectListSummary & {
  items: ProspectListItemRow[];
};

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

const addItemsSchema = z.object({
  listId: z.string(),
  prospectResultIds: z.array(z.string()).min(1).max(200),
});

export async function listProspectLists() {
  return apiServer<ProspectListSummary[]>("/prospect-lists");
}

export async function getProspectList(id: string) {
  if (!id) throw new Error("ID da lista obrigatório");
  return apiServer<ProspectListDetail>(`/prospect-lists/${id}`);
}

export async function createProspectList(input: z.infer<typeof createSchema>) {
  const data = createSchema.parse(input);
  const list = await apiServer<ProspectListSummary>("/prospect-lists", {
    method: "POST",
    json: data,
  });
  revalidatePath("/lista");
  revalidatePath("/disparo");
  return list;
}

export async function updateProspectList(
  id: string,
  input: { name?: string; description?: string | null },
) {
  if (!id) throw new Error("ID da lista obrigatório");
  await apiServer(`/prospect-lists/${id}`, {
    method: "PATCH",
    json: input,
  });
  revalidatePath("/lista");
  revalidatePath("/disparo");
}

export async function deleteProspectList(id: string) {
  if (!id) throw new Error("ID da lista obrigatório");
  await apiServer(`/prospect-lists/${id}`, { method: "DELETE" });
  revalidatePath("/lista");
  revalidatePath("/disparo");
}

export async function addProspectResultsToList(
  input: z.infer<typeof addItemsSchema>,
) {
  const data = addItemsSchema.parse(input);
  const res = await apiServer<{ added: number; skipped: number }>(
    `/prospect-lists/${data.listId}/items`,
    {
      method: "POST",
      json: { prospectResultIds: data.prospectResultIds },
    },
  );
  revalidatePath("/lista");
  revalidatePath("/disparo");
  return res;
}

export async function removeProspectListItem(listId: string, itemId: string) {
  if (!listId || !itemId) throw new Error("IDs obrigatórios");
  await apiServer(`/prospect-lists/${listId}/items/${itemId}`, {
    method: "DELETE",
  });
  revalidatePath("/lista");
  revalidatePath("/disparo");
}
