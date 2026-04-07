import type { CustomField } from "@prisma/client";
import { InboxClient } from "@/inbox";
import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { canConfigureTenant } from "@/lib/session";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const canManageConnections = await canConfigureTenant();
  const { contact: contactQuery } = await searchParams;
  const initialContactId = contactQuery?.trim() || null;

  if (initialContactId) {
    try {
      await apiServer<{ conversationId: string; created: boolean }>(
        "/inbox/ensure-conversation",
        { method: "POST", json: { contactId: initialContactId } },
      );
    } catch {
      /* Contato sem telefone, sem canal WhatsApp ativo, ou contato inválido — segue com a lista atual */
    }
  }

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <InboxClient
        connections={whatsAppConnections as never}
        quickReplies={quickReplies as never}
        initialConversations={conversations as never}
        initialContactId={initialContactId}
        dealCustomFieldDefs={dealCustomFieldDefs}
        tenantMembers={tenantMembers}
        canManageConnections={canManageConnections}
      />
    </div>
  );
}
