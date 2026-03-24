import prisma from "@/lib/prisma";
import { findContactCustomFieldDefinitions } from "@/lib/custom-fields-load";
import { getActiveTenantId } from "@/lib/session";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const tenantId = await getActiveTenantId();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const [
    connections,
    quickReplies,
    pipelines,
    tags,
    contactCustomFields,
  ] = await Promise.all([
    prisma.whatsAppConnection.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quickReply.findMany({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.pipeline.findMany({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.tag.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
    findContactCustomFieldDefinitions(tenantId),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground">
          Tenant: <strong>{tenant?.name}</strong> ({tenant?.slug})
        </p>
      </div>
      <SettingsClient
        connections={connections}
        quickReplies={quickReplies}
        appBaseUrl={baseUrl}
        pipelines={pipelines}
        tags={tags}
        contactCustomFields={contactCustomFields}
      />
    </div>
  );
}
