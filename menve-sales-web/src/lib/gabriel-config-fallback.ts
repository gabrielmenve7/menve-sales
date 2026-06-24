import type { GabrielConfigResponse } from "@/actions/agents";

export const GABRIEL_CONFIG_FALLBACK: GabrielConfigResponse = {
  agent: {
    id: "gabriel-agent-seed",
    key: "gabriel",
    displayName: "Gabriel",
    description: "Agente SDR de qualificação pós-disparo",
  },
  config: {
    gabrielEnabled: false,
    gabrielModel: null,
    gabrielReplyDelayMs: 1500,
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
