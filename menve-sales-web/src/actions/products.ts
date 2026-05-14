"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ProductOption = {
  id: string;
  name: string;
  price: number;
};

/** Lista produtos do tenant ativo (para selects em outras telas, ex.: bloco Produtos do deal). */
export async function listProducts(): Promise<ProductOption[]> {
  const rows = await apiServer<
    { id: string; name: string; price: number }[]
  >("/products");
  return rows.map((r) => ({ id: r.id, name: r.name, price: Number(r.price) }));
}

const productSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().finite().min(0),
});

export async function createProduct(input: z.infer<typeof productSchema>) {
  const data = productSchema.parse(input);
  await apiServer("/products", {
    method: "POST",
    json: { name: data.name.trim(), price: data.price },
  });
  revalidatePath("/produtos");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  price: z.number().finite().min(0).optional(),
});

export async function updateProduct(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  await apiServer(`/products/${data.id}`, {
    method: "PUT",
    json: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
    },
  });
  revalidatePath("/produtos");
}

export async function deleteProduct(id: string) {
  await apiServer(`/products/${id}`, { method: "DELETE" });
  revalidatePath("/produtos");
}
