"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

export type GabrielConfigResponse = {
  agent: {
    id: string;
    key: string;
    displayName: string;
    description: string | null;
  } | null;
  config: {
    gabrielEnabled: boolean;
    gabrielModel: string | null;
    gabrielReplyDelayMs: number;
  };
  skills: {
    skillKey: string;
    version: number;
    sourcePath: string | null;
    sortOrder: number;
    updatedAt: string;
  }[];
  metrics: {
    activeConversations: number;
    runsCompleted: number;
    runsFailed: number;
    meetingsHandoff: number;
    periodDays: number;
  };
};

export async function getGabrielConfig(): Promise<GabrielConfigResponse> {
  return apiServer<GabrielConfigResponse>("/agents/gabriel");
}

export async function updateGabrielConfig(input: {
  gabrielEnabled?: boolean;
  gabrielModel?: string | null;
  gabrielReplyDelayMs?: number;
}) {
  await apiServer("/agents/gabriel", {
    method: "PATCH",
    json: input,
  });
}

export async function syncGabrielSkills() {
  await apiServer("/agents/gabriel/sync-skills", { method: "POST" });
}

export async function takeoverConversation(conversationId: string) {
  await apiServer(`/agents/conversations/${conversationId}/takeover`, {
    method: "POST",
  });
  revalidatePath("/inbox");
}

export async function activateGabrielOnConversation(conversationId: string) {
  await apiServer(`/agents/conversations/${conversationId}/activate`, {
    method: "POST",
  });
  revalidatePath("/inbox");
}
