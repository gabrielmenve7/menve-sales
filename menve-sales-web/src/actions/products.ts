"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ProductOption = {
  id: string;
  name: string;
  price: number;
  /** Nome da coleção do catálogo, se houver. */
  collectionName: string | null;
};

/** Lista produtos do tenant (tela de produtos / edição completa). */
export async function listProducts(): Promise<ProductOption[]> {
  const rows = await apiServer<
    {
      id: string;
      name: string;
      price: number;
      collection: { id: string; name: string } | null;
    }[]
  >("/products");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    collectionName: r.collection?.name ?? null,
  }));
}

/** Catálogo mínimo para o funil (picker mais rápido: sem coleção no payload). */
export async function listProductsForPicker(): Promise<ProductOption[]> {
  const rows = await apiServer<{ id: string; name: string; price: number }[]>(
    "/products/picker",
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    collectionName: null,
  }));
}

const collectionIdField = z.union([z.string().min(1), z.null()]).optional();

const productSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().finite().min(0),
  collectionId: collectionIdField,
});

export async function createProduct(input: z.infer<typeof productSchema>) {
  const data = productSchema.parse(input);
  const resolvedCollectionId =
    data.collectionId === undefined ? null : data.collectionId;
  await apiServer("/products", {
    method: "POST",
    json: {
      name: data.name.trim(),
      price: data.price,
      collectionId: resolvedCollectionId,
    },
  });
  revalidatePath("/produtos");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  price: z.number().finite().min(0).optional(),
  collectionId: collectionIdField,
});

export async function updateProduct(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  await apiServer(`/products/${data.id}`, {
    method: "PUT",
    json: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.collectionId !== undefined
        ? { collectionId: data.collectionId }
        : {}),
    },
  });
  revalidatePath("/produtos");
}

export async function deleteProduct(id: string) {
  await apiServer(`/products/${id}`, { method: "DELETE" });
  revalidatePath("/produtos");
}
