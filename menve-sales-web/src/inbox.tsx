"use client";

import type { QuickReply, WhatsAppConnection } from "@prisma/client";
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

export type { InboxConversation } from "@/components/inbox/inbox-types";

async function fetchInbox() {
  const b = await fetchInboxBundle();
  return { conversations: b.conversations as InboxConversation[] };
}

export function InboxClient({
  connections,
  quickReplies,
  initialConversations,
}: {
  connections: WhatsAppConnection[];
  quickReplies: QuickReply[];
  initialConversations: InboxConversation[];
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
    <div className="flex h-full min-h-0 flex-1">
      {/* Conversation list */}
      <div className="w-[280px] shrink-0 lg:w-[320px]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Chat panel */}
      <div className="flex min-w-0 flex-1 flex-col">
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

      {/* Lead / pipeline (desktop) */}
      <div className="hidden w-[280px] shrink-0 lg:flex lg:w-[300px] xl:w-[320px]">
        {selected ? (
          <InboxLeadSidebar
            contactId={selected.contact.id}
            contactName={selected.contact.name}
            deals={selected.contact.deals ?? []}
            onLeadCreated={() => void refetch()}
          />
        ) : (
          <InboxLeadSidebarEmpty />
        )}
      </div>
    </div>
  );
}
