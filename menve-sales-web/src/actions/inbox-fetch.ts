"use server";

import { apiServer } from "@/lib/api-server";

export type InboxBundle = {
  whatsAppConnections: unknown[];
  quickReplyCategories: unknown[];
  conversations: unknown[];
};

export type InboxPipelineStage = { id: string; name: string; sortOrder: number };

export type InboxPipelineListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  stages: InboxPipelineStage[];
};

export async function fetchInboxBundle(): Promise<InboxBundle> {
  return apiServer<InboxBundle>("/inbox");
}

/** Lista mínima de funis para criar lead a partir do inbox (sob demanda). */
export async function fetchPipelinesListForInbox(): Promise<InboxPipelineListItem[]> {
  return apiServer<InboxPipelineListItem[]>("/pipelines");
}
