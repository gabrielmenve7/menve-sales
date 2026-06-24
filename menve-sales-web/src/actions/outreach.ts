"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type OutreachCampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type OutreachRecipientStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "REPLIED"
  | "FAILED"
  | "OPT_OUT";

export type OutreachCampaignSummary = {
  id: string;
  name: string;
  status: OutreachCampaignStatus;
  templateBody: string;
  list: { id: string; name: string } | null;
  connection: { id: string; name: string; provider: string };
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stats: {
    total: number;
    pending: number;
    sent: number;
    delivered: number;
    replied: number;
    failed: number;
    optOut: number;
  };
};

export type OutreachRecipientRow = {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
  status: OutreachRecipientStatus;
  sentAt: string | null;
  repliedAt: string | null;
  errorMessage: string | null;
};

export type OutreachCampaignDetail = OutreachCampaignSummary & {
  recipients: OutreachRecipientRow[];
};

const createSchema = z.object({
  name: z.string().min(1).max(120),
  listId: z.string(),
  connectionId: z.string(),
  templateBody: z.string().min(1).max(4000),
});

export async function listOutreachCampaigns() {
  return apiServer<OutreachCampaignSummary[]>("/outreach/campaigns");
}

export async function getOutreachCampaign(id: string) {
  if (!id) throw new Error("ID da campanha obrigatório");
  return apiServer<OutreachCampaignDetail>(`/outreach/campaigns/${id}`);
}

export async function createOutreachCampaign(
  input: z.infer<typeof createSchema>,
) {
  const data = createSchema.parse(input);
  const campaign = await apiServer<OutreachCampaignSummary>(
    "/outreach/campaigns",
    {
      method: "POST",
      json: data,
    },
  );
  revalidatePath("/disparo");
  return campaign;
}

export async function startOutreachCampaign(id: string) {
  if (!id) throw new Error("ID da campanha obrigatório");
  const res = await apiServer<OutreachCampaignSummary>(
    `/outreach/campaigns/${id}/start`,
    { method: "POST" },
  );
  revalidatePath("/disparo");
  return res;
}

export async function pauseOutreachCampaign(id: string) {
  if (!id) throw new Error("ID da campanha obrigatório");
  const res = await apiServer<OutreachCampaignSummary>(
    `/outreach/campaigns/${id}/pause`,
    { method: "POST" },
  );
  revalidatePath("/disparo");
  return res;
}
