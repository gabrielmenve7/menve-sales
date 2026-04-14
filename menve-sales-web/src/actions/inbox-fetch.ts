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

export async function fetchInboxConversation(conversationId: string) {
  return apiServer<unknown>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}`,
  );
}

/** Garante conversa no canal WhatsApp ativo (mesmo contrato da página `/inbox?contact=`). */
export async function ensureInboxConversationForContact(contactId: string) {
  return apiServer<{ conversationId: string; created: boolean }>(
    "/inbox/ensure-conversation",
    { method: "POST", json: { contactId } },
  );
}

/** Lista mínima de funis para criar lead a partir do inbox (sob demanda). */
export async function fetchPipelinesListForInbox(): Promise<InboxPipelineListItem[]> {
  return apiServer<InboxPipelineListItem[]>("/pipelines");
}
