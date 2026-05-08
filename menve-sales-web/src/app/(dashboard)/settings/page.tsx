import type { CustomField } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import { canManageWorkspaceFeatures } from "@/lib/session";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

type SettingsBundle = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    researchEnabled?: boolean;
  } | null;
  whatsAppConnections: unknown[];
  quickReplyCategories: unknown[];
  pipelines: unknown[];
  tags: unknown[];
  customFields: unknown[];
  members: unknown[];
};

const SETTINGS_TABS = [
  "general",
  "campos",
  "channels",
  "members",
  "tags",
  "notifications",
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  if (tabParam === "perfil") {
    redirect("/perfil");
  }
  const defaultTab = SETTINGS_TABS.includes(tabParam as (typeof SETTINGS_TABS)[number])
    ? (tabParam as (typeof SETTINGS_TABS)[number])
    : "general";

  const [data, dealCustomFieldsRaw, canManageWorkspace] = await Promise.all([
    apiServer<SettingsBundle>("/settings"),
    apiServer<unknown>("/custom-fields?entity=DEAL")
      .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
      .catch(() => [] as CustomField[]),
    canManageWorkspaceFeatures(),
  ]);

  if (!data.tenant) {
    redirect("/setup");
  }

  const webhookBaseUrl =
    process.env.WEBHOOK_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.INTERNAL_API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:4000";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-border/60 bg-card/95 p-5 shadow-lg dark:border-border/50 dark:bg-card/90 md:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Organização, canais, campos e integrações do workspace
          </p>
        </div>
        <SettingsClient
          tenant={data.tenant}
          canManageWorkspace={canManageWorkspace}
          defaultTab={defaultTab}
          connections={data.whatsAppConnections as never}
          quickReplyCategories={data.quickReplyCategories as never}
          webhookBaseUrl={webhookBaseUrl}
          pipelines={data.pipelines as never}
          tags={data.tags as never}
          contactCustomFields={data.customFields as never}
          dealCustomFields={dealCustomFieldsRaw as never}
          members={data.members as never}
        />
      </div>
    </div>
  );
}
