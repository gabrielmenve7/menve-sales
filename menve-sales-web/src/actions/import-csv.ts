"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

/** Importa CSV simples: name,phone,email,company (primeira linha = cabeçalho) */
export async function importContactsCsv(text: string) {
  const result = await apiServer<{ imported: number; skipped: number }>(
    "/contacts/import/csv",
    {
      method: "POST",
      json: { text },
    },
  );
  revalidatePath("/contacts");
  return result;
}
