import type { CustomField } from "@prisma/client";
import { InboxClient } from "@/inbox";
import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { canConfigureTenant } from "@/lib/session";

export default async function InboxPage() {
  const canManageConnections = await canConfigureTenant();

  const [
    inboxBundle,
    dealCustomFieldDefs,
    tenantMembers,
  ] = await Promise.all([
    apiServer<{
      whatsAppConnections: unknown[];
      quickReplies: unknown[];
      conversations: unknown[];
    }>("/inbox"),
    apiServer<unknown>("/custom-fields?entity=DEAL")
      .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
      .catch(() => [] as CustomField[]),
    apiServer<TenantMemberOption[]>("/settings/members").catch(
      () => [] as TenantMemberOption[],
    ),
  ]);

  const { whatsAppConnections, quickReplies, conversations } = inboxBundle;

  return (
    <InboxClient
      connections={whatsAppConnections as never}
      quickReplies={quickReplies as never}
      initialConversations={conversations as never}
      dealCustomFieldDefs={dealCustomFieldDefs}
      tenantMembers={tenantMembers}
      canManageConnections={canManageConnections}
    />
  );
}
