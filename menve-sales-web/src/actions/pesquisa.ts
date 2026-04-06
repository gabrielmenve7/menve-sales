"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const querySchema = z.object({
  query: z.string().min(3).max(200),
});

async function wrapProspecting<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Error && /^API 403:/.test(e.message)) {
      throw new Error("Pesquisa está desativada para este workspace.");
    }
    throw e;
  }
}

export async function prospectingSearch(query: string) {
  const { query: q } = querySchema.parse({ query });
  return wrapProspecting(
    apiServer<{ search: unknown; results: unknown[] }>(
      "/prospecting/search",
      { method: "POST", json: { query: q } },
    ),
  );
}

export async function prospectingGetSearch(searchId: string) {
  if (!searchId) throw new Error("searchId obrigatório");
  return wrapProspecting(
    apiServer<{
      search: unknown;
      results: unknown[];
      totalWithSite: number;
      enrichedCount: number;
      isComplete: boolean;
    }>(`/prospecting/searches/${searchId}`),
  );
}

export async function prospectingLoadMoreWeb(searchId: string) {
  return wrapProspecting(
    apiServer<{ added: number; exhausted: boolean; totalCount: number }>(
      `/prospecting/searches/${searchId}/more-web`,
      { method: "POST" },
    ),
  );
}

export async function prospectingDeleteSearch(searchId: string) {
  await wrapProspecting(
    apiServer(`/prospecting/searches/${searchId}`, {
      method: "DELETE",
    }),
  );
  revalidatePath("/pesquisa");
}

const patchSchema = z.object({
  resultId: z.string(),
  status: z
    .enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISCARDED"])
    .optional(),
  notes: z.string().max(5000).optional(),
});

export async function prospectingPatchResult(
  input: z.infer<typeof patchSchema>,
) {
  const data = patchSchema.parse(input);
  await wrapProspecting(
    apiServer(`/prospecting/results/${data.resultId}`, {
      method: "PATCH",
      json: {
        ...(data.status != null ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    }),
  );
  revalidatePath("/pesquisa");
}

const convertSchema = z.object({
  resultId: z.string(),
  pipelineId: z.string(),
  title: z.string().optional(),
  value: z.number().optional(),
});

export async function prospectingConvert(input: z.infer<typeof convertSchema>) {
  const data = convertSchema.parse(input);
  const res = await wrapProspecting(apiServer<
    | { ok: true; contactId: string }
    | {
        ok: false;
        duplicate: true;
        contactId: string;
        message: string;
      }
  >(`/prospecting/results/${data.resultId}/convert`, {
    method: "POST",
    json: {
      pipelineId: data.pipelineId,
      title: data.title,
      value: data.value,
    },
  }));
  revalidatePath("/pesquisa");
  revalidatePath("/pipeline");
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  return res;
}

const bulkSchema = z.object({
  resultIds: z.array(z.string()).min(1).max(50),
  pipelineId: z.string(),
});

export async function prospectingConvertBulk(
  input: z.infer<typeof bulkSchema>,
) {
  const data = bulkSchema.parse(input);
  const res = await wrapProspecting(
    apiServer<{
      converted: number;
      skippedDuplicate: number;
      errors: string[];
    }>("/prospecting/convert-bulk", {
      method: "POST",
      json: data,
    }),
  );
  revalidatePath("/pesquisa");
  revalidatePath("/pipeline");
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  return res;
}
