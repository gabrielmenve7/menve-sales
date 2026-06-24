import type { LarissaConfigResponse } from "@/actions/agents";

export const LARISSA_CONFIG_FALLBACK: LarissaConfigResponse = {
  agent: {
    id: "larissa-agent-seed",
    key: "larissa",
    displayName: "Larissa",
    description: "Agente SDR de qualificação pós-disparo",
  },
  config: {
    larissaEnabled: false,
    larissaModel: null,
    larissaReplyDelayMs: 1500,
  },
  skills: [],
  metrics: {
    activeConversations: 0,
    runsCompleted: 0,
    runsFailed: 0,
    meetingsHandoff: 0,
    periodDays: 7,
  },
};
