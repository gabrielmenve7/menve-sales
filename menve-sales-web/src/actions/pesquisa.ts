"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ProspectSearchStatus =
  | "RUNNING"
  | "ENRICHING"
  | "DONE"
  | "ERROR";

export type ProspectSearchHistory = {
  id: string;
  query: string;
  segment: string | null;
  state: string | null;
  city: string | null;
  location: string | null;
  engines: string[];
  totalCount: number;
  qualifiedCount: number;
  status: ProspectSearchStatus;
  webExhausted?: boolean;
  createdAt: string;
  user: { name: string | null; email: string | null };
};

export type ProspectStats = {
  searches: number;
  companies: number;
  qualified: number;
};

const engineSchema = z.enum(["maps", "search"]);

const structuredSearchSchema = z.object({
  segment: z.string().min(3).max(200),
  state: z.string().min(2).max(2),
  city: z.string().min(2).max(120),
  engines: z.array(engineSchema).min(1).max(2),
});

const legacyQuerySchema = z.object({
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

function prospectingErrorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.errors[0]?.message ?? "Preencha segmento, estado, cidade e fontes.";
  }
  if (e instanceof Error) {
    const m = e.message;
    const match = /^API \d+: ([\s\S]+)$/.exec(m);
    if (match?.[1]) {
      try {
        const body = JSON.parse(match[1]) as {
          message?: string | string[];
        };
        if (Array.isArray(body.message)) return body.message.join(", ");
        if (typeof body.message === "string") return body.message;
      } catch {
        return match[1].slice(0, 500);
      }
    }
    return m;
  }
  return "Falha na captura. Tente novamente.";
}

export async function prospectingGetStats(): Promise<ProspectStats> {
  return wrapProspecting(apiServer<ProspectStats>("/prospecting/stats"));
}

export type ProspectingSearchResult =
  | { ok: true; searchId: string }
  | { ok: false; message: string };

export async function prospectingSearch(
  input: z.infer<typeof structuredSearchSchema> | string,
): Promise<ProspectingSearchResult> {
  try {
    const json =
      typeof input === "string"
        ? legacyQuerySchema.parse({ query: input })
        : structuredSearchSchema.parse(input);

    const res = await wrapProspecting(
      apiServer<{ search: { id: string }; results: unknown[] }>(
        "/prospecting/search",
        { method: "POST", json },
      ),
    );

    revalidatePath("/lista");
    revalidatePath("/pesquisa");
    return { ok: true, searchId: res.search.id };
  } catch (e) {
    return { ok: false, message: prospectingErrorMessage(e) };
  }
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
  revalidatePath("/lista");
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
  revalidatePath("/lista");
  revalidatePath("/pesquisa");
}

const convertSchema = z.object({
  resultId: z.string(),
  pipelineId: z.string(),
  title: z.string().optional(),
  value: z.number().optional(),
  phoneOverride: z.string().max(80).optional(),
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
      ...(data.phoneOverride?.trim()
        ? { phoneOverride: data.phoneOverride.trim() }
        : {}),
    },
  }));
  revalidatePath("/lista");
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
  revalidatePath("/lista");
  revalidatePath("/pesquisa");
  revalidatePath("/pipeline");
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  return res;
}
