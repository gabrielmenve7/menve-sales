"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
