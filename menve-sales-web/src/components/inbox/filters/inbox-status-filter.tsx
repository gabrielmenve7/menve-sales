"use client";

import type { LucideIcon } from "lucide-react";
import {
  Check,
  CircleOff,
  Hourglass,
  Kanban,
  List,
  MailOpen,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { InboxConversation } from "@/components/inbox/inbox-types";

/** Um filtro ativo por vez; `null` = Todos. */
export type InboxFilterId =
  | "UNREAD"
  | "WAITING"
  | "PIPELINE"
  | "NO_PIPELINE";

type FilterRow = {
  id: InboxFilterId;
  label: string;
  icon: LucideIcon;
};

const FILTER_ROWS: FilterRow[] = [
  {
    id: "UNREAD",
    label: "Não lidas",
    icon: MailOpen,
  },
  {
    id: "WAITING",
    label: "Aguardando",
    icon: Hourglass,
  },
  {
    id: "PIPELINE",
    label: "Oportunidade",
    icon: Kanban,
  },
  {
    id: "NO_PIPELINE",
    label: "Fora do pipeline",
    icon: CircleOff,
  },
];

/** Última mensagem da thread é do cliente → precisa atenção (proxy de “não lida”). */
function conversationLooksUnread(c: InboxConversation): boolean {
  const last = c.messages.at(-1);
  if (!last) return false;
  return last.direction === "INBOUND";
}

function contactHasOpenDealInPipeline(c: InboxConversation): boolean {
  return (c.contact.deals?.length ?? 0) > 0;
}

export function conversationMatchesInboxFilter(
  c: InboxConversation,
  filter: InboxFilterId | null,
): boolean {
  if (filter === null) return true;
  if (filter === "WAITING") return c.status === "WAITING";
  if (filter === "PIPELINE") return contactHasOpenDealInPipeline(c);
  if (filter === "NO_PIPELINE") return !contactHasOpenDealInPipeline(c);
  if (filter === "UNREAD") return conversationLooksUnread(c);
  return true;
}

export function InboxStatusFilterMenu({
  activeFilter,
  onActiveFilterChange,
}: {
  activeFilter: InboxFilterId | null;
  onActiveFilterChange: (next: InboxFilterId | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectRow = useCallback(
    (id: InboxFilterId) => {
      onActiveFilterChange(activeFilter === id ? null : id);
      setOpen(false);
    },
    [activeFilter, onActiveFilterChange],
  );

  const hasActiveFilters = activeFilter !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative shrink-0"
          aria-label="Filtros do WhatsApp"
        >
          <SlidersHorizontal className="size-4" />
          {hasActiveFilters ? (
            <span
              className="absolute right-1 top-1 size-1.5 rounded-full bg-primary-solid"
              aria-hidden
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end" sideOffset={6}>
        <div className="border-b border-border/40 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Filtro
          </p>
        </div>
        <div className="p-1">
          <button
            type="button"
            onClick={() => {
              onActiveFilterChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
              "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <List className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">Todos</span>
            {!hasActiveFilters ? (
              <Check className="size-4 shrink-0 text-primary-solid" />
            ) : null}
          </button>
          {FILTER_ROWS.map((row) => {
            const Icon = row.icon;
            const checked = activeFilter === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => selectRow(row.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  checked && "bg-muted/60",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{row.label}</span>
                {checked ? (
                  <Check className="size-4 shrink-0 text-primary-solid" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InboxStatusFilterChips({
  activeFilter,
  onActiveFilterChange,
}: {
  activeFilter: InboxFilterId | null;
  onActiveFilterChange: (next: InboxFilterId | null) => void;
}) {
  const row = useMemo(
    () =>
      activeFilter ? FILTER_ROWS.find((r) => r.id === activeFilter) : undefined,
    [activeFilter],
  );

  if (!row) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      <button
        type="button"
        onClick={() => onActiveFilterChange(null)}
        aria-label={`Remover filtro ${row.label}`}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-muted/50 px-2.5 py-0.5 text-xs font-medium",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span className="truncate">{row.label}</span>
        <X className="size-3 shrink-0 opacity-70" aria-hidden />
      </button>
    </div>
  );
}
