"use client";

import type { ConversationStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
  MessageCircle,
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

export type InboxStatusFilterId = "PENDING" | "OPEN" | "WAITING" | "CLOSED";

type FilterRow = {
  id: InboxStatusFilterId;
  label: string;
  statuses: ConversationStatus[];
  icon: LucideIcon;
};

const FILTER_ROWS: FilterRow[] = [
  {
    id: "PENDING",
    label: "Pendentes",
    statuses: ["WAITING", "IN_PROGRESS"],
    icon: Clock,
  },
  {
    id: "OPEN",
    label: "Abertos",
    statuses: ["IN_PROGRESS"],
    icon: MessageCircle,
  },
  {
    id: "WAITING",
    label: "Aguardando",
    statuses: ["WAITING"],
    icon: Hourglass,
  },
  {
    id: "CLOSED",
    label: "Fechados",
    statuses: ["RESOLVED"],
    icon: CheckCircle2,
  },
];

export function conversationMatchesStatusFilters(
  status: ConversationStatus,
  selectedIds: readonly InboxStatusFilterId[],
): boolean {
  if (selectedIds.length === 0) return true;
  return selectedIds.some((id) => {
    const row = FILTER_ROWS.find((r) => r.id === id);
    return row?.statuses.includes(status) ?? false;
  });
}

function toggleId(
  current: InboxStatusFilterId[],
  id: InboxStatusFilterId,
): InboxStatusFilterId[] {
  const has = current.includes(id);
  if (has) return current.filter((x) => x !== id);
  return [...current, id];
}

export function InboxStatusFilterMenu({
  selectedIds,
  onSelectedIdsChange,
}: {
  selectedIds: InboxStatusFilterId[];
  onSelectedIdsChange: (next: InboxStatusFilterId[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const clearAll = useCallback(() => {
    onSelectedIdsChange([]);
  }, [onSelectedIdsChange]);

  const toggle = useCallback(
    (id: InboxStatusFilterId) => {
      onSelectedIdsChange(toggleId(selectedIds, id));
    },
    [onSelectedIdsChange, selectedIds],
  );

  const hasActiveFilters = selectedIds.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative shrink-0"
          aria-label="Filtros de status"
        >
          <SlidersHorizontal className="size-4" />
          {hasActiveFilters ? (
            <span
              className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
              aria-hidden
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end" sideOffset={6}>
        <div className="border-b border-border/40 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Status
          </p>
        </div>
        <div className="p-1">
          <button
            type="button"
            onClick={() => {
              clearAll();
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
              "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Inbox className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">Todos</span>
            {!hasActiveFilters ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : null}
          </button>
          {FILTER_ROWS.map((row) => {
            const Icon = row.icon;
            const checked = selectedIds.includes(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggle(row.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  checked && "bg-muted/60",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{row.label}</span>
                {checked ? (
                  <Check className="size-4 shrink-0 text-primary" />
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
  selectedIds,
  onSelectedIdsChange,
}: {
  selectedIds: InboxStatusFilterId[];
  onSelectedIdsChange: (next: InboxStatusFilterId[]) => void;
}) {
  const toggle = useCallback(
    (id: InboxStatusFilterId) => {
      onSelectedIdsChange(toggleId(selectedIds, id));
    },
    [onSelectedIdsChange, selectedIds],
  );

  const chips = useMemo(() => {
    return selectedIds
      .map((id) => FILTER_ROWS.find((r) => r.id === id))
      .filter(Boolean) as FilterRow[];
  }, [selectedIds]);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {chips.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => toggle(row.id)}
          aria-label={`Remover filtro ${row.label}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-muted/50 px-2.5 py-0.5 text-xs font-medium",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="truncate">{row.label}</span>
          <X className="size-3 shrink-0 opacity-70" aria-hidden />
        </button>
      ))}
    </div>
  );
}
