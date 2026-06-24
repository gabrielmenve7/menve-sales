"use client";

import type { LarissaConfigResponse } from "@/actions/agents";
import { AgentesPanel } from "@/components/agentes/agentes-panel";

export function AgentesClient({
  initial,
}: {
  initial: LarissaConfigResponse;
}) {
  return <AgentesPanel initial={initial} />;
}
