"use client";

import type { CustomField, QuickReply, WhatsAppConnection } from "@prisma/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchInboxBundle } from "@/actions/inbox-fetch";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ChatEmptyState } from "@/components/inbox/chat-empty-state";
import {
  InboxLeadSidebar,
  InboxLeadSidebarEmpty,
} from "@/components/inbox/inbox-lead-sidebar";
import type { InboxConversation } from "@/components/inbox/inbox-types";
import type { TenantMemberOption } from "@/lib/custom-field-types";

export type { InboxConversation } from "@/components/inbox/inbox-types";

async function fetchInbox() {
  const b = await fetchInboxBundle();
  return { conversations: b.conversations as InboxConversation[] };
}

export function InboxClient({
  connections,
  quickReplies,
  initialConversations,
  dealCustomFieldDefs,
  tenantMembers,
}: {
  connections: WhatsAppConnection[];
  quickReplies: QuickReply[];
  initialConversations: InboxConversation[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers: TenantMemberOption[];
  canManageConnections?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );

  const { data, refetch } = useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInbox,
    initialData: { conversations: initialConversations },
    refetchInterval: 5000,
  });

  const conversations = data?.conversations ?? initialConversations;

  useEffect(() => {
    if (selectedId && !conversations.some((c) => c.id === selectedId)) {
      setSelectedId(conversations[0]?.id ?? null);
    }
  }, [conversations, selectedId]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Conversation list */}
      <div className="flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden lg:w-[320px]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Chat panel */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <ChatPanel
            conversation={selected}
            quickReplies={quickReplies}
            onRefetch={() => void refetch()}
          />
        ) : (
          <ChatEmptyState />
        )}
      </div>

      {/* Oportunidade / pipeline (desktop) — mesmo painel editável do funil */}
      <div className="hidden h-full min-h-0 w-[min(100%,28rem)] min-w-[260px] max-w-[28rem] shrink-0 flex-col overflow-hidden lg:flex">
        {selected ? (
          <InboxLeadSidebar
            contact={selected.contact}
            deals={selected.contact.deals ?? []}
            dealCustomFieldDefs={dealCustomFieldDefs}
            tenantMembers={tenantMembers}
            onLeadChanged={() => void refetch()}
          />
        ) : (
          <InboxLeadSidebarEmpty />
        )}
      </div>
    </div>
  );
}
