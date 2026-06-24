import { getLarissaConfig } from "@/actions/agents";
import { AgentesClient } from "./agentes-client";

export default async function AgentesPage() {
  let initial;
  try {
    initial = await getLarissaConfig();
  } catch {
    initial = {
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
  }

  return <AgentesClient initial={initial} />;
}
