"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ProductCollectionRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export async function listProductCollections(): Promise<ProductCollectionRow[]> {
  return apiServer<ProductCollectionRow[]>("/product-collections");
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

export async function createProductCollection(
  input: z.infer<typeof createSchema>,
) {
  const data = createSchema.parse(input);
  await apiServer("/product-collections", {
    method: "POST",
    json: { name: data.name.trim() },
  });
  revalidatePath("/produtos");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
});

export async function updateProductCollection(
  input: z.infer<typeof updateSchema>,
) {
  const data = updateSchema.parse(input);
  await apiServer(`/product-collections/${data.id}`, {
    method: "PUT",
    json: { name: data.name.trim() },
  });
  revalidatePath("/produtos");
}

export async function deleteProductCollection(id: string) {
  await apiServer(`/product-collections/${id}`, { method: "DELETE" });
  revalidatePath("/produtos");
}
