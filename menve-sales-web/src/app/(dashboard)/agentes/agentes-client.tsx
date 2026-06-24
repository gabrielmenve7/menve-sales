"use client";

import type { GabrielConfigResponse } from "@/actions/agents";
import { AgentesPanel } from "@/components/agentes/agentes-panel";

export function AgentesClient({
  initial,
}: {
  initial: GabrielConfigResponse;
}) {
  return <AgentesPanel initial={initial} />;
}
