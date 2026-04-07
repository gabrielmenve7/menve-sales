"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const categoryNameSchema = z.string().min(1).max(80);

const qrSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
});

export async function createQuickReplyCategory(name: string) {
  const n = categoryNameSchema.parse(name.trim());
  await apiServer("/quick-reply-categories", {
    method: "POST",
    json: { name: n },
  });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

export async function deleteQuickReplyCategory(id: string) {
  await apiServer(`/quick-reply-categories/${id}`, { method: "DELETE" });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

export async function createQuickReply(input: z.infer<typeof qrSchema>) {
  const data = qrSchema.parse(input);
  await apiServer("/quick-replies", {
    method: "POST",
    json: {
      categoryId: data.categoryId.trim(),
      title: data.title.trim(),
      body: data.body.trim(),
    },
  });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

export async function deleteQuickReply(id: string) {
  await apiServer(`/quick-replies/${id}`, { method: "DELETE" });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}
