"use server";

import type { Tag } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** Lista tags do tenant (para UI após criar tag, etc.). */
export async function listTags(): Promise<Tag[]> {
  try {
    const raw = await apiServer<unknown>("/tags");
    return Array.isArray(raw) ? (raw as Tag[]) : [];
  } catch {
    return [];
  }
}

const tagNameSchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().max(32).optional(),
});

export async function createTag(input: z.infer<typeof tagNameSchema>) {
  const data = tagNameSchema.parse(input);
  await apiServer("/tags", {
    method: "POST",
    json: { name: data.name.trim(), color: data.color },
  });
  revalidatePath("/contacts");
  revalidatePath("/settings");
  revalidatePath("/pipeline");
  revalidatePath("/inbox");
}

/** Criação de tag a partir de Configurações (apenas OWNER/ADMIN/MANAGER/SUPER_ADMIN). */
export async function createCatalogTag(input: z.infer<typeof tagNameSchema>) {
  await assertCanConfigureTenant();
  const data = tagNameSchema.parse(input);
  await apiServer("/tags/catalog", {
    method: "POST",
    json: { name: data.name.trim(), color: data.color },
  });
  revalidatePath("/contacts");
  revalidatePath("/settings");
}

const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64).optional(),
  color: z.string().max(32).nullable().optional(),
});

export async function updateTag(input: z.infer<typeof updateTagSchema>) {
  await assertCanConfigureTenant();
  const data = updateTagSchema.parse(input);
  await apiServer(`/tags/${data.id}`, {
    method: "PUT",
    json: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });
  revalidatePath("/contacts");
  revalidatePath("/settings");
}

export async function deleteTag(tagId: string) {
  await assertCanConfigureTenant();
  await apiServer(`/tags/${tagId}`, { method: "DELETE" });
  revalidatePath("/contacts");
  revalidatePath("/settings");
}

export async function addTagToContact(contactId: string, tagId: string) {
  await apiServer(`/contacts/${contactId}/tags/${tagId}`, { method: "POST" });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/pipeline");
  revalidatePath("/inbox");
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  await apiServer(`/contacts/${contactId}/tags/${tagId}`, { method: "DELETE" });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/pipeline");
  revalidatePath("/inbox");
}
