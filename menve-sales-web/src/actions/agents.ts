"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

export type LarissaConfigResponse = {
  agent: {
    id: string;
    key: string;
    displayName: string;
    description: string | null;
  } | null;
  config: {
    larissaEnabled: boolean;
    larissaModel: string | null;
    larissaReplyDelayMs: number;
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

export async function getLarissaConfig(): Promise<LarissaConfigResponse> {
  return apiServer<LarissaConfigResponse>("/agents/larissa");
}

export async function updateLarissaConfig(input: {
  larissaEnabled?: boolean;
  larissaModel?: string | null;
  larissaReplyDelayMs?: number;
}) {
  await apiServer("/agents/larissa", {
    method: "PATCH",
    json: input,
  });
  revalidatePath("/agentes");
}

export async function syncLarissaSkills() {
  await apiServer("/agents/larissa/sync-skills", { method: "POST" });
  revalidatePath("/agentes");
}

export async function takeoverConversation(conversationId: string) {
  await apiServer(`/agents/conversations/${conversationId}/takeover`, {
    method: "POST",
  });
  revalidatePath("/inbox");
}

export async function activateLarissaOnConversation(conversationId: string) {
  await apiServer(`/agents/conversations/${conversationId}/activate`, {
    method: "POST",
  });
  revalidatePath("/inbox");
}
