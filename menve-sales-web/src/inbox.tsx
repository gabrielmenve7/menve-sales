"use client";

import type { CustomField, WhatsAppConnection } from "@prisma/client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ensureInboxConversationForContact,
  fetchInboxBundle,
} from "@/actions/inbox-fetch";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ChatEmptyState } from "@/components/inbox/chat-empty-state";
import {
  InboxLeadSidebar,
  InboxLeadSidebarEmpty,
} from "@/components/inbox/inbox-lead-sidebar";
import type { InboxConversation } from "@/components/inbox/inbox-types";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import type { QuickReplyCategoryDTO } from "@/lib/quick-reply-types";

export type { InboxConversation } from "@/components/inbox/inbox-types";

async function fetchInbox() {
  const b = await fetchInboxBundle();
  return { conversations: b.conversations as InboxConversation[] };
}

function lastMessageMillis(c: InboxConversation): number {
  const raw = c.lastMessageAt as string | Date | null | undefined;
  if (raw == null) return 0;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }
  const t = raw.getTime();
  return Number.isFinite(t) ? t : 0;
}

function createdMillis(c: InboxConversation): number {
  const raw = c.createdAt as string | Date;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }
  const t = raw.getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Mesmo contato pode ter mais de uma conversa (ex.: troca de instância WhatsApp).
 * Prioriza canal ativo e, entre eles, a thread com atividade mais recente.
 */
function pickBestConversationForContact(
  conversations: InboxConversation[],
  contactId: string,
): string | null {
  const matches = conversations.filter((c) => c.contact.id === contactId);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.id;

  const active = matches.filter((c) => c.whatsappConnection.isActive);
  const pool = active.length > 0 ? active : matches;

  const sorted = [...pool].sort((a, b) => {
    const diff = lastMessageMillis(b) - lastMessageMillis(a);
    if (diff !== 0) return diff;
    return createdMillis(b) - createdMillis(a);
  });
  return sorted[0]!.id;
}

function resolveDeepLinkConversationId(
  conversations: InboxConversation[],
  initialConversationId: string | null | undefined,
  initialContactId: string | null | undefined,
): string | null {
  if (
    initialConversationId &&
    conversations.some((c) => c.id === initialConversationId)
  ) {
    return initialConversationId;
  }
  if (initialContactId) {
    return pickBestConversationForContact(conversations, initialContactId);
  }
  return null;
}

export function InboxClient({
  connections,
  quickReplyCategories,
  initialConversations,
  initialContactId = null,
  initialConversationId = null,
  dealCustomFieldDefs,
  tenantMembers,
}: {
  connections: WhatsAppConnection[];
  quickReplyCategories: QuickReplyCategoryDTO[];
  initialConversations: InboxConversation[];
  /** Abre a conversa deste contato (ex.: vindo do funil `?contact=`). */
  initialContactId?: string | null;
  /** ID exato retornado por `POST /inbox/ensure-conversation` (canal ativo). */
  initialConversationId?: string | null;
  dealCustomFieldDefs: CustomField[];
  tenantMembers: TenantMemberOption[];
  canManageConnections?: boolean;
}) {
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const fromDeepLink = resolveDeepLinkConversationId(
      initialConversations,
      initialConversationId,
      initialContactId,
    );
    if (fromDeepLink) return fromDeepLink;
    if (initialContactId || initialConversationId) return null;
    return initialConversations[0]?.id ?? null;
  });

  const { data, refetch } = useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInbox,
    initialData: { conversations: initialConversations },
    refetchInterval: 5000,
  });

  const conversations = data?.conversations ?? initialConversations;

  const deepLinkSpecRef = useRef<string | null>(null);

  useEffect(() => {
    const spec = initialConversationId
      ? `conv:${initialConversationId}`
      : initialContactId
        ? `contact:${initialContactId}`
        : null;
    if (!spec) {
      deepLinkSpecRef.current = null;
      return;
    }
    const next = resolveDeepLinkConversationId(
      conversations,
      initialConversationId,
      initialContactId,
    );
    if (!next) return;

    if (deepLinkSpecRef.current !== spec) {
      deepLinkSpecRef.current = spec;
      setSelectedId(next);
      return;
    }
    if (selectedId === null) {
      setSelectedId(next);
    }
  }, [
    initialContactId,
    initialConversationId,
    conversations,
    selectedId,
  ]);

  useEffect(() => {
    if (selectedId && !conversations.some((c) => c.id === selectedId)) {
      setSelectedId(conversations[0]?.id ?? null);
    }
  }, [conversations, selectedId]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const openContactInInbox = useCallback(
    async (contactId: string) => {
      const syncSelect = (list: InboxConversation[], cid: string) => {
        const conv = list.find((c) => c.contact.id === cid);
        if (conv) {
          setSelectedId(conv.id);
          return true;
        }
        return false;
      };

      if (syncSelect(conversations, contactId)) {
        if (typeof window !== "undefined") {
          window.history.replaceState(
            null,
            "",
            `/inbox?contact=${encodeURIComponent(contactId)}`,
          );
        }
        return;
      }

      try {
        const ensured = await ensureInboxConversationForContact(contactId);
        const { data, error } = await refetch();
        if (error) throw error;
        const list = (data?.conversations ?? []) as InboxConversation[];
        const nextId =
          pickBestConversationForContact(list, contactId) ??
          ensured.conversationId;
        setSelectedId(nextId);
        if (typeof window !== "undefined") {
          window.history.replaceState(
            null,
            "",
            `/inbox?contact=${encodeURIComponent(contactId)}`,
          );
        }
      } catch {
        router.push(`/inbox?contact=${encodeURIComponent(contactId)}`);
      }
    },
    [conversations, refetch, router],
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Conversation list */}
      <div className="flex min-h-0 w-[280px] shrink-0 flex-col overflow-hidden lg:w-[320px]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Chat panel — coluna central com altura limitada; só a área de mensagens rola */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <ChatPanel
            conversation={selected}
            quickReplyCategories={quickReplyCategories}
            onRefetch={() => void refetch()}
          />
        ) : (
          <ChatEmptyState />
        )}
      </div>

      {/* Oportunidade / pipeline (desktop) — mesmo painel editável do funil */}
      <div className="hidden min-h-0 w-[min(100%,28rem)] min-w-[260px] max-w-[28rem] shrink-0 flex-col overflow-hidden lg:flex">
        {selected ? (
          <InboxLeadSidebar
            contact={selected.contact}
            deals={selected.contact.deals ?? []}
            dealCustomFieldDefs={dealCustomFieldDefs}
            tenantMembers={tenantMembers}
            onLeadChanged={() => void refetch()}
            onOpenContactInInbox={openContactInInbox}
          />
        ) : (
          <InboxLeadSidebarEmpty />
        )}
      </div>
    </div>
  );
}
