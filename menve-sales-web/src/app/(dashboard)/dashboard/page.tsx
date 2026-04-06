import { DashboardBuilderClient } from "@/components/dashboard/dashboard-builder-client";
import { apiServer } from "@/lib/api-server";
import type {
  DashboardBoardDto,
  DealCustomFieldDef,
  PipelineListItem,
  TagListItem,
} from "@/lib/dashboard-builder-types";

type PipelineRow = { id: string; name: string; isDefault: boolean };

export default async function DashboardPage() {
  const [boards, pipelines, tags, dealCustomFields] = await Promise.all([
    apiServer<DashboardBoardDto[]>("/dashboard/boards"),
    apiServer<PipelineRow[]>("/pipelines"),
    apiServer<TagListItem[]>("/tags"),
    apiServer<DealCustomFieldDef[]>("/custom-fields?entity=DEAL"),
  ]);
  const slim: PipelineListItem[] = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
  }));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardBuilderClient
        initialBoards={boards}
        initialPipelines={slim}
        initialTags={tags}
        initialDealCustomFields={dealCustomFields}
      />
    </div>
  );
}
