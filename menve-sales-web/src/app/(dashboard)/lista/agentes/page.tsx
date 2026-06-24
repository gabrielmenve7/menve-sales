import { getLarissaConfig } from "@/actions/agents";
import { apiServer } from "@/lib/api-server";
import { getPrimaryProspectList } from "@/actions/prospect-lists";
import {
  prospectingGetStats,
  type ProspectSearchHistory,
  type ProspectStats,
} from "@/actions/pesquisa";
import { LARISSA_CONFIG_FALLBACK } from "@/lib/larissa-config-fallback";
import { canConfigureTenant } from "@/lib/session";
import { getTenantFromRequest } from "@/lib/tenant";
import { PesquisaClient } from "../../pesquisa/pesquisa-client";
import { redirect } from "next/navigation";

export default async function ListaAgentesPage() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  if ((tenant as { researchEnabled?: boolean }).researchEnabled === false) {
    redirect("/dashboard");
  }

  const canManageAgents = await canConfigureTenant();
  if (!canManageAgents) {
    redirect("/lista");
  }

  const [stats, searches, primaryList, larissaConfig] = await Promise.all([
    prospectingGetStats().catch(
      (): ProspectStats => ({ searches: 0, companies: 0, qualified: 0 }),
    ),
    apiServer<ProspectSearchHistory[]>("/prospecting/searches"),
    getPrimaryProspectList().catch(() => null),
    getLarissaConfig().catch(() => LARISSA_CONFIG_FALLBACK),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <PesquisaClient
        title="Lista"
        initialStats={stats}
        initialSearches={searches}
        initialPrimaryList={primaryList}
        initialTab="agents"
        initialLarissaConfig={larissaConfig}
        showAgentsTab
        agentsPath="/lista/agentes"
        listaPath="/lista"
      />
    </div>
  );
}
