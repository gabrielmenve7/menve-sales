import { DashboardBuilderClient } from "@/components/dashboard/dashboard-builder-client";
import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import type {
  DashboardBoardDto,
  DealCustomFieldDef,
  PipelineListItem,
  TagListItem,
} from "@/lib/dashboard-builder-types";

type PipelineRow = { id: string; name: string; isDefault: boolean };

export default async function DashboardPage() {
  try {
    const [boards, pipelines, tags, dealCustomFields, tenantMembers] =
      await Promise.all([
        apiServer<DashboardBoardDto[]>("/dashboard/boards"),
        apiServer<PipelineRow[]>("/pipelines"),
        apiServer<TagListItem[]>("/tags"),
        apiServer<DealCustomFieldDef[]>("/custom-fields?entity=DEAL"),
        apiServer<TenantMemberOption[]>("/settings/members").catch(() => []),
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
          initialTenantMembers={tenantMembers}
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
