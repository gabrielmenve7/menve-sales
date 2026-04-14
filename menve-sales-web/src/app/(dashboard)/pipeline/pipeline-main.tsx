import type { CustomField, Pipeline, Stage } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { canConfigureTenant } from "@/lib/session";
import { PipelineView } from "./pipeline-view";

type PipelineRow = Pipeline & { stages: Stage[] };

type PipelineDealsPayload = {
  deals: unknown[];
  stats: {
    openCount: number;
    openSum: number;
    wonCount: number;
    lostCount: number;
  };
};

/**
 * Todo o carregamento do funil fica aqui, dentro de `Suspense` na página,
 * para a navegação poder mostrar o skeleton logo ao trocar de aba.
 */
export async function PipelineMain({
  searchParams: sp,
}: {
  searchParams: { pipelineId?: string; tab?: string };
}) {
  const openAutomationsFromUrl = sp.tab === "automations";
  const queryPipelineId = sp.pipelineId;

  const [
    pipelines,
    dealCustomFieldDefs,
    members,
    campaignSources,
    tenantTags,
    canConfigureAutomations,
  ] = await Promise.all([
    apiServer<PipelineRow[]>("/pipelines"),
    apiServer<unknown>("/custom-fields?entity=DEAL")
      .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
      .catch(() => [] as CustomField[]),
    apiServer<TenantMemberOption[]>("/settings/members").catch(
      () => [] as TenantMemberOption[],
    ),
    apiServer<{ id: string; name: string }[]>(
      "/contacts/campaign-sources",
    ).catch(() => [] as { id: string; name: string }[]),
    apiServer<{ id: string; name: string }[]>("/tags").catch(
      () => [] as { id: string; name: string }[],
    ),
    canConfigureTenant(),
  ]);

  if (pipelines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum pipeline configurado. Crie um funil em Configurações.
      </p>
    );
  }

  const activePipeline =
    pipelines.find((p) => p.id === queryPipelineId) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0];

  const dealsResult = await apiServer<PipelineDealsPayload>(
    `/pipelines/${activePipeline!.id}/deals`,
  );

  return (
    <PipelineView
      pipelines={pipelines as never}
      activePipeline={activePipeline as never}
      deals={dealsResult.deals as never}
      stats={dealsResult.stats}
      dealCustomFieldDefs={dealCustomFieldDefs}
      tenantMembers={members}
      campaignSources={campaignSources}
      tenantTags={tenantTags}
      openAutomationsFromUrl={openAutomationsFromUrl}
      canConfigureAutomations={canConfigureAutomations}
    />
  );
}
