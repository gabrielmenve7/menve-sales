import type { CustomField } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import { SettingsClient } from "./settings-client";

type SettingsBundle = {
  tenant: { id: string; name: string; slug: string; plan: string };
  whatsAppConnections: unknown[];
  quickReplies: unknown[];
  pipelines: unknown[];
  tags: unknown[];
  customFields: unknown[];
  members: unknown[];
};

export default async function SettingsPage() {
  const [data, dealCustomFieldsRaw] = await Promise.all([
    apiServer<SettingsBundle>("/settings"),
    apiServer<unknown>("/custom-fields?entity=DEAL")
      .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
      .catch(() => [] as CustomField[]),
  ]);

  const webhookBaseUrl =
    process.env.WEBHOOK_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.INTERNAL_API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:4000";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie sua organização e integrações
        </p>
      </div>
      <SettingsClient
        tenant={data.tenant as never}
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
