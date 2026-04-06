"use client";

import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  conversationMatchesStatusFilters,
  InboxStatusFilterChips,
  InboxStatusFilterMenu,
  type InboxStatusFilterId,
} from "@/components/inbox/filters/inbox-status-filter";
import { Input } from "@/components/ui/input";
import type { InboxConversation } from "./inbox-types";
import { ConversationItem } from "./conversation-item";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: InboxConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilterIds, setStatusFilterIds] = useState<InboxStatusFilterId[]>(
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      const matchesStatus = conversationMatchesStatusFilters(
        c.status,
        statusFilterIds,
      );
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        c.contact.name.toLowerCase().includes(q) ||
        (c.contact.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [conversations, search, statusFilterIds]);

  const setStatusFilters = useCallback((next: InboxStatusFilterId[]) => {
    setStatusFilterIds(next);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/20 p-3 dark:border-border/30">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          <InboxStatusFilterMenu
            selectedIds={statusFilterIds}
            onSelectedIdsChange={setStatusFilters}
          />
        </div>
        <InboxStatusFilterChips
          selectedIds={statusFilterIds}
          onSelectedIdsChange={setStatusFilters}
        />
      </div>
      <div className="flex-1 divide-y divide-border/15 overflow-y-auto dark:divide-border/25">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Search className="size-5 text-muted-foreground/60" />
            </span>
            <p className="text-sm text-muted-foreground">
              Nenhuma conversa encontrada
            </p>
          </div>
        ) : (
          filtered.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              selected={c.id === selectedId}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
