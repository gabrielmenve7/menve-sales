import { queryDashboardWidgetsBulk } from "@/actions/dashboard-widgets";
import { DashboardBuilderClient } from "@/components/dashboard/dashboard-builder-client";
import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import {
  parseLayoutJson,
  type DashboardBoardDto,
  type DealCustomFieldDef,
  type PipelineListItem,
  type TagListItem,
  type WidgetDataResult,
} from "@/lib/dashboard-builder-types";

/** Resposta de `GET /pipelines` (inclui etapas para cores nos gráficos). */
type PipelineFromApi = {
  id: string;
  name: string;
  isDefault: boolean;
  color?: string | null;
  wonStageId?: string | null;
  lostStageId?: string | null;
  stages?: { id: string; name: string; color?: string | null }[];
};

export default async function DashboardPage() {
  try {
    const [boards, pipelines, tags, dealCustomFields, tenantMembers] =
      await Promise.all([
        apiServer<DashboardBoardDto[]>("/dashboard/boards"),
        apiServer<PipelineFromApi[]>("/pipelines"),
        apiServer<TagListItem[]>("/tags"),
        apiServer<DealCustomFieldDef[]>("/custom-fields?entity=DEAL"),
        apiServer<TenantMemberOption[]>("/settings/members").catch(() => []),
      ]);
    const slim: PipelineListItem[] = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      color: p.color ?? null,
      wonStageId: p.wonStageId ?? null,
      lostStageId: p.lostStageId ?? null,
      stages: (p.stages ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? null,
      })),
    }));

    let initialWidgetBundle: {
      boardId: string;
      specsKey: string;
      rows: WidgetDataResult[];
    } | null = null;
    try {
      const firstBoard = boards[0];
      if (firstBoard) {
        const layout = parseLayoutJson(firstBoard.layoutJson);
        const specs = layout.widgets.map((w) => w.querySpec);
        if (specs.length > 0) {
          const specsKey = JSON.stringify(specs);
          const rows = await queryDashboardWidgetsBulk(specs);
          initialWidgetBundle = { boardId: firstBoard.id, specsKey, rows };
        }
      }
    } catch (e) {
      console.error("[menve/dashboard] pré-carga dos cartões falhou:", e);
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DashboardBuilderClient
          initialBoards={boards}
          initialPipelines={slim}
          initialTags={tags}
          initialDealCustomFields={dealCustomFields}
          initialTenantMembers={tenantMembers}
          initialWidgetBundle={initialWidgetBundle}
        />
      </div>
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[menve/dashboard] SSR falhou:", msg);
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-medium">Não foi possível carregar o dashboard</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Em produção, confira na Vercel (ambiente <strong>Production</strong>):{" "}
          <code className="rounded bg-muted px-1">INTERNAL_API_URL</code>,{" "}
          <code className="rounded bg-muted px-1">INTERNAL_API_KEY</code> (igual
          à Railway) e se a API está no ar. Host{" "}
          <code className="rounded bg-muted px-1">crm.menvedigital.com.br</code>{" "}
          exige tenant com slug <code className="rounded bg-muted px-1">crm</code>{" "}
          no banco — rode o seed atualizado ou crie o tenant.
        </p>
        {process.env.NODE_ENV === "development" ? (
          <pre className="mt-2 max-w-full overflow-x-auto rounded-md border bg-muted/50 p-3 text-left text-xs">
            {msg}
          </pre>
        ) : null}
      </div>
    );
  }
}
