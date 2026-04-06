import type { CustomField } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import { canManageWorkspaceFeatures } from "@/lib/session";
import { SettingsClient } from "./settings-client";

type SettingsBundle = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    researchEnabled?: boolean;
  };
  whatsAppConnections: unknown[];
  quickReplies: unknown[];
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

  const webhookBaseUrl =
    process.env.WEBHOOK_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.INTERNAL_API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:4000";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie sua organização e integrações
        </p>
      </div>
      <SettingsClient
        tenant={data.tenant as never}
        canManageWorkspace={canManageWorkspace}
        defaultTab={defaultTab}
        connections={data.whatsAppConnections as never}
        quickReplies={data.quickReplies as never}
        webhookBaseUrl={webhookBaseUrl}
        pipelines={data.pipelines as never}
        tags={data.tags as never}
        contactCustomFields={data.customFields as never}
        dealCustomFields={dealCustomFieldsRaw as never}
        members={data.members as never}
      />
    </div>
  );
}
