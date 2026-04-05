"use client";

import type { CustomField } from "@prisma/client";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Largura fixa estilo ClickUp (lista estreita, não largura da linha). */
const PANEL_W = 252;

const shellClass = cn(
  "flex w-[252px] max-w-[min(252px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border shadow-lg",
  "border-border/70 bg-background text-foreground",
  "dark:border-[#383838] dark:bg-[#2b2b2b] dark:text-neutral-200 dark:shadow-black/30",
);

const searchInputClass = cn(
  "h-7 w-full rounded border px-2 py-1 pl-7 text-xs",
  "border-border bg-background text-foreground placeholder:text-muted-foreground",
  "dark:border-[#454545] dark:bg-[#222222] dark:text-neutral-100 dark:placeholder:text-neutral-500",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "dark:focus-visible:ring-white/20",
);

/** Pílulas como na referência ClickUp / modal Menve. */
const optionRowClass = cn(
  "flex w-full min-w-0 items-center justify-center rounded-lg border px-2.5 py-1.5 text-center text-xs leading-tight transition-colors",
  "border-border/80 bg-background text-foreground",
  "hover:bg-muted/70 dark:border-white/10 dark:bg-[#333333] dark:hover:bg-[#3a3a3a]",
);

/** Opção «limpar» com valor vazio selecionado: mesmo fundo claro das demais opções. */
const optionClearSelectedClass =
  "border-border/80 bg-background text-muted-foreground ring-1 ring-border/50 hover:bg-muted/70 dark:border-white/10 dark:bg-[#333333] dark:text-neutral-400 dark:ring-white/15 dark:hover:bg-[#3a3a3a]";

const optionSelectedClass =
  "border-primary bg-primary text-primary-foreground hover:bg-primary dark:border-blue-600 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-600";

type InlineSelectFieldRowProps = {
  field: CustomField;
  value: string;
  disabled: boolean;
  required: boolean;
  inputId: string;
  contentZClass?: string;
  rowClassName: string;
  labelSlot: ReactNode;
  valueShellClassName: string;
  /** Lista minimalista no modal do deal: placeholder “Adicionar …”, alinhamento à esquerda. */
  variant?: "default" | "minimal";
  onCommitValue: (next: string) => Promise<void>;
  onReorderOptions?: (orderedLabels: string[]) => Promise<void>;
  onAppendOption?: (label: string) => Promise<void>;
  onDefinitionError?: (message: string) => void;
};

function SortableOptionRow({
  id,
  label,
  activeValue,
  allowDrag,
  onPick,
}: {
  id: string;
  label: string;
  activeValue: string;
  allowDrag: boolean;
  onPick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !allowDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  const isSelected = activeValue === label;

  return (
    <div ref={setNodeRef} style={style} className="flex min-w-0 items-stretch gap-1">
      {allowDrag ? (
        <button
          type="button"
          className={cn(
            "flex w-5 shrink-0 cursor-grab items-center justify-center rounded border border-transparent text-muted-foreground active:cursor-grabbing",
            "hover:bg-muted/50 dark:text-neutral-500 dark:hover:bg-white/[0.06]",
          )}
          aria-label="Reordenar opção"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3" strokeWidth={2} />
        </button>
      ) : (
        <div className="w-1 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={onPick}
        className={cn(
          optionRowClass,
          "flex-1",
          isSelected && optionSelectedClass,
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </div>
  );
}

export function InlineSelectFieldRow({
  field,
  value,
  disabled,
  required,
  inputId,
  contentZClass = "z-[100]",
  rowClassName,
  labelSlot,
  valueShellClassName,
  onCommitValue,
  onReorderOptions,
  onAppendOption,
  onDefinitionError,
  variant = "default",
}: InlineSelectFieldRowProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ordered, setOrdered] = useState<string[]>([]);
  const [metaBusy, setMetaBusy] = useState(false);

  const baseOptions = useMemo(() => {
    const raw = field.options;
    if (!Array.isArray(raw)) return [] as string[];
    return raw.map((x) => String(x));
  }, [field.options]);

  useEffect(() => {
    if (open) {
      setOrdered([...baseOptions]);
      setQuery("");
    }
  }, [open, baseOptions]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return ordered;
    return ordered.filter((o) => o.toLowerCase().includes(q));
  }, [ordered, q]);

  const useDnD = Boolean(onReorderOptions) && !q;

  const showAddRow =
    Boolean(onAppendOption) &&
    query.trim().length > 0 &&
    !ordered.some((o) => o.toLowerCase() === query.trim().toLowerCase());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!onReorderOptions || q) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = ordered.indexOf(String(active.id));
      const newIndex = ordered.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const prev = [...ordered];
      const next = arrayMove(ordered, oldIndex, newIndex);
      setOrdered(next);
      setMetaBusy(true);
      try {
        await onReorderOptions(next);
      } catch (e) {
        setOrdered(prev);
        onDefinitionError?.(
          e instanceof Error ? e.message : "Não foi possível reordenar",
        );
      } finally {
        setMetaBusy(false);
      }
    },
    [onReorderOptions, ordered, q, onDefinitionError],
  );

  const isMinimal = variant === "minimal";
  const triggerLabel =
    value.trim().length > 0
      ? value
      : required
        ? "Selecione…"
        : isMinimal
          ? `Adicionar ${field.name.toLowerCase()}`
          : "—";

  async function pick(next: string) {
    try {
      await onCommitValue(next);
    } finally {
      setOpen(false);
    }
  }

  async function appendAndPick() {
    const label = query.trim();
    if (!label || !onAppendOption) return;
    setMetaBusy(true);
    try {
      await onAppendOption(label);
      await onCommitValue(label);
      setOpen(false);
    } catch (e) {
      onDefinitionError?.(
        e instanceof Error ? e.message : "Não foi possível adicionar opção",
      );
    } finally {
      setMetaBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div className={rowClassName}>
          {labelSlot}
          <div className={valueShellClassName}>
            <PopoverTrigger asChild>
              <button
                type="button"
                id={inputId}
                disabled={disabled || metaBusy}
                className={cn(
                  "h-9 w-full min-w-0 cursor-pointer rounded-md border-0 bg-transparent py-1.5 text-sm outline-none",
                  isMinimal ? "px-0 text-left italic" : "px-2 text-right",
                  "text-foreground ring-0 focus-visible:ring-0 disabled:opacity-50",
                )}
                aria-haspopup="dialog"
                aria-expanded={open}
              >
                <span
                  className={cn(
                    !value &&
                      "text-muted-foreground dark:text-neutral-500",
                    isMinimal && !value && "italic",
                  )}
                >
                  {triggerLabel}
                </span>
              </button>
            </PopoverTrigger>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={2}
        avoidCollisions={false}
        style={{ width: PANEL_W, maxWidth: "min(252px, calc(100vw - 1.5rem))" }}
        className={cn(
          contentZClass,
          "border-0 bg-transparent p-0 shadow-none",
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className={shellClass}>
          <div className="border-b border-border/60 px-1.5 py-1.5 dark:border-[#404040]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground dark:text-neutral-500"
                strokeWidth={2}
              />
              <input
                type="search"
                placeholder="Pesquise ou adicione opções..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={searchInputClass}
                autoFocus
              />
            </div>
          </div>

          <div
            className="max-h-[min(40vh,240px)] min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 py-1.5 [scrollbar-color:rgba(120,120,120,0.45)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgba(255,255,255,0.2)_transparent]"
            role="listbox"
          >
            {!required ? (
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                disabled={disabled || metaBusy}
                onClick={() => void pick("")}
                className={cn(
                  optionRowClass,
                  "w-full",
                  value === "" && optionClearSelectedClass,
                )}
              >
                —
              </button>
            ) : null}

            {useDnD ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void onDragEnd(e)}
              >
                <SortableContext
                  items={ordered}
                  strategy={verticalListSortingStrategy}
                >
                  {ordered.map((opt) => (
                    <SortableOptionRow
                      key={opt}
                      id={opt}
                      label={opt}
                      activeValue={value}
                      allowDrag
                      onPick={() => void pick(opt)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              filtered.map((opt) => (
                <div key={opt} className="flex min-w-0 items-stretch gap-1">
                  <div className="w-1 shrink-0" aria-hidden />
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === opt}
                    disabled={disabled || metaBusy}
                    onClick={() => void pick(opt)}
                    className={cn(
                      optionRowClass,
                      "flex-1",
                      value === opt && optionSelectedClass,
                    )}
                  >
                    <span className="min-w-0 truncate">{opt}</span>
                  </button>
                </div>
              ))
            )}

            {showAddRow ? (
              <button
                type="button"
                disabled={disabled || metaBusy}
                onClick={() => void appendAndPick()}
                className={cn(
                  optionRowClass,
                  "w-full border-dashed text-muted-foreground dark:text-neutral-400",
                )}
              >
                Adicionar &quot;{query.trim()}&quot;
              </button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
