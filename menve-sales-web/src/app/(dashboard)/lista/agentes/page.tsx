import { getGabrielConfig } from "@/actions/agents";
import { getPrimaryProspectList } from "@/actions/prospect-lists";
import { AgentesPanel } from "@/components/agentes/agentes-panel";
import { ProspeccaoTabs } from "@/components/prospeccao/prospeccao-tabs";
import { GABRIEL_CONFIG_FALLBACK } from "@/lib/gabriel-config-fallback";
import { canConfigureTenant } from "@/lib/session";
import { getTenantFromRequest } from "@/lib/tenant";
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

  const [primaryList, gabrielConfig] = await Promise.all([
    getPrimaryProspectList().catch(() => null),
    getGabrielConfig().catch(() => GABRIEL_CONFIG_FALLBACK),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agentes IA</h1>
          <p className="text-sm text-muted-foreground">
            Configure agentes para qualificar leads no Atendimento após o
            Disparo.
          </p>
        </div>

        <ProspeccaoTabs
          active="agents"
          listItemCount={primaryList?.itemCount ?? 0}
        />

        <AgentesPanel initial={gabrielConfig} embedded />
      </div>
    </div>
  );
}
