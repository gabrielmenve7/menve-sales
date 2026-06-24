"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type LeadScoringField =
  | "has_whatsapp"
  | "has_email"
  | "has_website"
  | "replied"
  | "rating_gte";

export type LeadScoringRule = {
  id: string;
  field: LeadScoringField;
  value: boolean | number;
  points: number;
  enabled: boolean;
};

export type LeadScoringRulesPayload = {
  rules: LeadScoringRule[];
  updatedAt: string | null;
};

const rulesSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      field: z.enum([
        "has_whatsapp",
        "has_email",
        "has_website",
        "replied",
        "rating_gte",
      ]),
      value: z.union([z.boolean(), z.number()]),
      points: z.number().int().min(-100).max(100),
      enabled: z.boolean(),
    }),
  ),
});

export async function fetchLeadScoringRules() {
  return apiServer<LeadScoringRulesPayload>("/lead-scoring/rules");
}

export async function updateLeadScoringRules(
  input: z.infer<typeof rulesSchema>,
) {
  const data = rulesSchema.parse(input);
  const res = await apiServer<LeadScoringRulesPayload>("/lead-scoring/rules", {
    method: "PUT",
    json: data,
  });
  revalidatePath("/lead-scoring");
  return res;
}

export async function recalculateLeadScores() {
  const res = await apiServer<{ updated: number }>(
    "/lead-scoring/recalculate",
    { method: "POST" },
  );
  revalidatePath("/lead-scoring");
  revalidatePath("/contacts");
  return res;
}
