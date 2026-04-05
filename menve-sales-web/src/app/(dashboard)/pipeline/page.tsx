import type { CustomField } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
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
      <div className="p-6">
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

  const [dealsResult, contactCustomFieldDefs, dealCustomFieldDefs] =
    await Promise.all([
      apiServer<PipelineDealsPayload>(
        `/pipelines/${activePipeline!.id}/deals`,
      ),
      apiServer<unknown>("/custom-fields?entity=CONTACT")
        .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
        .catch(() => [] as CustomField[]),
      apiServer<unknown>("/custom-fields?entity=DEAL")
        .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
        .catch(() => [] as CustomField[]),
    ]);

  return (
    <div className="p-6">
      <PipelineView
        pipelines={pipelines as never}
        activePipeline={activePipeline as never}
        deals={dealsResult.deals as never}
        contacts={contacts}
        stats={dealsResult.stats}
        contactCustomFieldDefs={contactCustomFieldDefs}
        dealCustomFieldDefs={dealCustomFieldDefs}
      />
    </div>
  );
}
