"use server";

import { apiServer } from "@/lib/api-server";
import { z } from "zod";

export type ProspectingFunnelStage = {
  stageId: string;
  stageName: string;
  sortOrder: number;
  dealCount: number;
  cumulativeCount: number;
};

export type ProspectingFunnelReport = {
  from: string;
  to: string;
  sources: string[];
  totals: {
    searches: number;
    results: number;
    listItems: number;
    campaigns: number;
    messagesSent: number;
    replies: number;
    meetings: number;
    dealsWon: number;
    revenueWonBrl: number;
  };
  funnel: ProspectingFunnelStage[];
};

const rangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function fetchProspectingFunnel(
  input: z.infer<typeof rangeSchema> = {},
) {
  const q = rangeSchema.parse(input);
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  const qs = params.toString();
  return apiServer<ProspectingFunnelReport>(
    `/reports/prospecting-funnel${qs ? `?${qs}` : ""}`,
  );
}
