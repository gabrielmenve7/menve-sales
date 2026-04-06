import type { CustomField } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { PipelineView } from "./pipeline-view";

type PipelineRow = {
  id: string;
  isDefault: boolean;
  stages: unknown[];
};

type PipelineDealsPayload = {
  deals: unknown[];
  stats: {
    openCount: number;
    openSum: number;
    wonCount: number;
    lostCount: number;
  };
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ pipelineId?: string }>;
}) {
  const { pipelineId: queryPipelineId } = await searchParams;

  const [contacts, pipelines] = await Promise.all([
    apiServer<{ id: string; name: string; phone: string | null }[]>(
      "/contacts/for-pipeline",
    ),
    apiServer<PipelineRow[]>("/pipelines"),
  ]);

  if (pipelines.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
        <p className="text-sm text-muted-foreground">
          Nenhum pipeline configurado. Crie um funil em Configurações.
        </p>
      </div>
    );
  }

  const activePipeline =
    pipelines.find((p) => p.id === queryPipelineId) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0];

  const [dealsResult, dealCustomFieldDefs, members] = await Promise.all([
    apiServer<PipelineDealsPayload>(`/pipelines/${activePipeline!.id}/deals`),
    apiServer<unknown>("/custom-fields?entity=DEAL")
      .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
      .catch(() => [] as CustomField[]),
    apiServer<TenantMemberOption[]>("/settings/members").catch(
      () => [] as TenantMemberOption[],
    ),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <PipelineView
        pipelines={pipelines as never}
        activePipeline={activePipeline as never}
        deals={dealsResult.deals as never}
        contacts={contacts}
        stats={dealsResult.stats}
        dealCustomFieldDefs={dealCustomFieldDefs}
        tenantMembers={members}
      />
    </div>
  );
}
