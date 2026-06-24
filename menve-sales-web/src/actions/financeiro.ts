"use server";

import { apiServer } from "@/lib/api-server";
import { z } from "zod";

export type RevenueSellerRank = {
  userId: string;
  name: string | null;
  wonCount: number;
  wonValueBrl: number;
};

export type RevenueStats = {
  from: string;
  to: string;
  wonValueBrl: number;
  wonCount: number;
  forecastBrl: number;
  openCount: number;
  sellers: RevenueSellerRank[];
};

const rangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function fetchRevenueStats(
  input: z.infer<typeof rangeSchema> = {},
) {
  const q = rangeSchema.parse(input);
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  const qs = params.toString();
  return apiServer<RevenueStats>(
    `/dashboard/revenue${qs ? `?${qs}` : ""}`,
  );
}
