import type { CustomField } from "@prisma/client";
import type { InboxConversation } from "@/components/inbox/inbox-types";
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

  let initialConversationId: string | null = null;
  if (initialContactId) {
    try {
      const ensured = await apiServer<{ conversationId: string; created: boolean }>(
        "/inbox/ensure-conversation",
        { method: "POST", json: { contactId: initialContactId } },
      );
      initialConversationId = ensured.conversationId;
    } catch {
      /* Contato sem telefone, sem canal WhatsApp ativo, ou contato inválido — segue com a lista atual */
    }
  }

  const [
    inboxBundle,
    dealCustomFieldDefs,
    tenantMembers,
    initialConversationDetail,
  ] = await Promise.all([
    apiServer<{
      whatsAppConnections: unknown[];
      quickReplyCategories: unknown[];
      conversations: unknown[];
    }>("/inbox"),
    apiServer<unknown>("/custom-fields?entity=DEAL")
      .then((raw) => (Array.isArray(raw) ? (raw as CustomField[]) : []))
      .catch(() => [] as CustomField[]),
    apiServer<TenantMemberOption[]>("/settings/members").catch(
      () => [] as TenantMemberOption[],
    ),
    initialConversationId
      ? apiServer<InboxConversation>(
          `/inbox/conversations/${encodeURIComponent(initialConversationId)}`,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const { whatsAppConnections, quickReplyCategories, conversations } = inboxBundle;
  const convs = conversations as InboxConversation[];
  const listRowForDeepLink =
    initialConversationId != null
      ? (convs.find((c) => c.id === initialConversationId) ?? null)
      : null;
  const mergedInitialConversationDetail =
    listRowForDeepLink && initialConversationDetail
      ? ({ ...listRowForDeepLink, ...initialConversationDetail } as InboxConversation)
      : (initialConversationDetail as InboxConversation | null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <InboxClient
        connections={whatsAppConnections as never}
        quickReplyCategories={quickReplyCategories as never}
        initialConversations={conversations as never}
        initialContactId={initialContactId}
        initialConversationId={initialConversationId}
        initialConversationDetail={mergedInitialConversationDetail}
        dealCustomFieldDefs={dealCustomFieldDefs}
        tenantMembers={tenantMembers}
        canManageConnections={canManageConnections}
      />
    </div>
  );
}
