"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndMonitor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { CustomField, Pipeline, Stage } from "@prisma/client";
import { MoreVertical, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { patchContact } from "@/actions/contacts";
import { archiveDeal, deleteDeal, moveDealStage } from "@/actions/deals";
import { WhatsAppLogo } from "@/components/icons/whatsapp-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user/user-avatar";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";
import { PipelineDealDetailDialog } from "./pipeline-deal-detail-dialog";
import {
  PipelineColumnNewDealFooterTrigger,
  PipelineColumnNewDealHeaderButton,
  PipelineNewDealDialog,
} from "./pipeline-new-deal";
import { columnSurfaceStyle } from "./pipeline-stage-visual";
import type { DealRow } from "./pipeline-types";

export type { DealRow } from "./pipeline-types";

/** Colunas mais largas (~18,75rem); sidebar mais fina libera área para cartões maiores. */

function relativeShort(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  if (diff < 0 || Number.isNaN(d.getTime())) return "—";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return `${days}d`;
  if (hrs >= 1) return `${hrs}h`;
  if (mins >= 1) return `${mins}m`;
  return "agora";
}

function formatDealCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Só visual — usado no DragOverlay (fora da coluna com overflow). */
function DealCardDragOverlayFace({ deal }: { deal: DealRow }) {
  const displayValue =
    deal.value != null && Number.isFinite(Number(deal.value))
      ? Number(deal.value)
      : 0;
  return (
    <div className="pointer-events-none w-[min(calc(100vw-2rem-1.5rem),18.75rem)] shrink-0 overflow-hidden rounded-lg border border-border/55 bg-card font-sans shadow-lg ring-2 ring-foreground/10">
      <div className="relative px-4 py-3 font-sans">
        <div className="absolute right-3 top-3 flex justify-end">
          <LeadAssigneeAvatar assignedTo={deal.assignedTo} />
        </div>
        <div className="min-w-0 space-y-2 pr-8">
          <p className="text-[12px] font-semibold leading-none text-muted-foreground">
            Contato
          </p>
          <p className="truncate text-[12.5px] font-medium leading-snug text-foreground">
            {deal.contact.name}
          </p>
          {deal.contact.company?.trim() ? (
            <p className="truncate text-[10px] leading-snug text-muted-foreground">
              {deal.contact.company.trim()}
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[12.5px] font-semibold tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400">
            {formatDealCurrency(displayValue)}
          </p>
          <div className="flex shrink-0 items-center gap-1 text-[10px] font-normal leading-none tabular-nums text-muted-foreground">
            <span className="flex size-6 items-center justify-center text-foreground/80">
              <WhatsAppLogo className="size-3.5" />
            </span>
            <span title="Atualizado">{relativeShort(deal.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadAssigneeAvatar({
  assignedTo,
}: {
  assignedTo: DealRow["assignedTo"];
}) {
  const title =
    assignedTo?.name?.trim() ||
    assignedTo?.email?.trim() ||
    "Sem responsável";

  if (!assignedTo) {
    return (
      <span
        title="Sem responsável"
        aria-label="Sem responsável"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <User className="size-3 text-foreground/55" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span title={title} aria-label={`Responsável: ${title}`}>
      <UserAvatar
        user={{
          name: assignedTo.name,
          email: assignedTo.email ?? "",
          image: assignedTo.image,
        }}
        size="sm"
        className="size-6 text-[11px] font-semibold uppercase tracking-tight"
      />
    </span>
  );
}

function DealCard({
  deal,
  onOpenDetail,
}: {
  deal: DealRow;
  onOpenDetail: (d: DealRow) => void;
}) {
  const router = useRouter();
  const suppressOpenRef = useRef(false);
  const suppressOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameLeadName, setRenameLeadName] = useState(deal.contact.name);
  const [renameBusy, setRenameBusy] = useState(false);

  function armSuppressDetailOpen(ms = 450) {
    suppressOpenRef.current = true;
    if (suppressOpenTimerRef.current) {
      clearTimeout(suppressOpenTimerRef.current);
    }
    suppressOpenTimerRef.current = setTimeout(() => {
      suppressOpenRef.current = false;
      suppressOpenTimerRef.current = null;
    }, ms);
  }

  useEffect(() => {
    if (!renaming) setRenameLeadName(deal.contact.name);
  }, [deal.contact.name, renaming]);

  useEffect(
    () => () => {
      if (suppressOpenTimerRef.current) {
        clearTimeout(suppressOpenTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (renaming) {
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renaming]);

  useDndMonitor({
    onDragEnd({ active }) {
      if (String(active.id) === deal.id) {
        suppressOpenRef.current = true;
        window.setTimeout(() => {
          suppressOpenRef.current = false;
        }, 120);
      }
    },
    onDragCancel({ active }) {
      if (String(active.id) === deal.id) {
        suppressOpenRef.current = true;
        window.setTimeout(() => {
          suppressOpenRef.current = false;
        }, 120);
      }
    },
  });

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });
  const listenerMap = (listeners ?? {}) as {
    onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  } & Record<string, unknown>;
  const { onPointerDown: dndPointerDown, ...listenersRest } = listenerMap;

  const displayValue =
    deal.value != null && Number.isFinite(Number(deal.value))
      ? Number(deal.value)
      : 0;

  function onCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenDetail(deal);
    }
  }

  function handleCardClick() {
    if (renaming || cardMenuOpen || suppressOpenRef.current) return;
    onOpenDetail(deal);
  }

  async function onRenameSave() {
    const t = renameLeadName.trim();
    if (t.length < 1) return;
    if (t === deal.contact.name.trim()) {
      setRenaming(false);
      return;
    }
    setRenameBusy(true);
    try {
      await patchContact({ contactId: deal.contactId, name: t });
      setRenaming(false);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setRenameBusy(false);
    }
  }

  function onRenameBlur() {
    if (renameBusy) return;
    const t = renameLeadName.trim();
    if (t.length < 1) {
      setRenameLeadName(deal.contact.name);
      setRenaming(false);
      return;
    }
    if (t === deal.contact.name.trim()) {
      setRenaming(false);
      return;
    }
    void onRenameSave();
  }

  async function onDelete() {
    if (
      !window.confirm(
        "Excluir esta oportunidade? Esta ação não pode ser desfeita.",
      )
    )
      return;
    try {
      await deleteDeal(deal.id);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  async function onArchive() {
    if (
      !window.confirm(
        "Arquivar esta oportunidade? Ela sai do funil, mas o histórico no contato é mantido.",
      )
    )
      return;
    try {
      await archiveDeal(deal.id);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao arquivar.");
    }
  }

  return (
    <div
      ref={setNodeRef}
      data-pipeline-card
      {...listenersRest}
      {...attributes}
      onPointerDown={(e) => {
        dndPointerDown?.(e);
        e.stopPropagation();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Lead ${deal.contact.name}. Arraste para mover de etapa ou clique para abrir.`}
      className={cn(
        "group w-full shrink-0 touch-none overflow-hidden rounded-lg border border-border/55 bg-card font-sans shadow-[0_1px_3px_rgba(15,23,42,0.06)] outline-none transition-[box-shadow,opacity] hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.45)]",
        isDragging
          ? "cursor-grabbing opacity-50 shadow-md ring-1 ring-foreground/15"
          : "cursor-grab opacity-100 active:cursor-grabbing",
      )}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (renaming || cardMenuOpen) return;
        onCardKeyDown(e);
      }}
    >
      <div className="relative px-4 py-3 font-sans">
        {!renaming ? (
          <div className="absolute right-2.5 top-2.5 z-10">
            <div className="relative size-6 shrink-0">
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
                  cardMenuOpen
                    ? "pointer-events-none opacity-0"
                    : "opacity-100 group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:pointer-events-none group-focus-within:opacity-0",
                )}
              >
                <LeadAssigneeAvatar assignedTo={deal.assignedTo} />
              </span>
              <DropdownMenu
                open={cardMenuOpen}
                onOpenChange={(open) => {
                  setCardMenuOpen(open);
                  if (!open) armSuppressDetailOpen();
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "absolute inset-0 flex items-center justify-center rounded-md text-muted-foreground outline-none transition-opacity duration-150 hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      cardMenuOpen
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Mais ações"
                  >
                    <MoreVertical className="size-4" strokeWidth={2} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-44"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setCardMenuOpen(false);
                      setRenameLeadName(deal.contact.name);
                      setRenaming(true);
                    }}
                  >
                    Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      setCardMenuOpen(false);
                      void onDelete();
                    }}
                  >
                    Excluir
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setCardMenuOpen(false);
                      void onArchive();
                    }}
                  >
                    Arquivar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : null}

        <div
          className={cn("min-w-0 space-y-2", !renaming && "pr-8")}
          onPointerDown={(e) => renaming && e.stopPropagation()}
          onClick={(e) => renaming && e.stopPropagation()}
        >
          <p className="text-[12px] font-semibold leading-none text-muted-foreground">
            Contato
          </p>
          {renaming ? (
            <Input
              ref={renameInputRef}
              disabled={renameBusy}
              placeholder="Nome do lead"
              className="h-9 border-0 bg-transparent px-0 text-[12.5px] font-medium shadow-none outline-none ring-0 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label="Nome do lead"
              value={renameLeadName}
              onChange={(e) => setRenameLeadName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onRenameSave();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setRenameLeadName(deal.contact.name);
                  setRenaming(false);
                }
              }}
              onBlur={() => onRenameBlur()}
            />
            ) : (
              <>
                <p className="truncate text-[12.5px] font-medium leading-snug text-foreground">
                  {deal.contact.name}
                </p>
                {deal.contact.company?.trim() ? (
                  <p className="truncate text-[10px] leading-snug text-muted-foreground">
                    {deal.contact.company.trim()}
                  </p>
                ) : null}
              </>
            )}
          </div>

        <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[12.5px] font-semibold tabular-nums leading-none tracking-tight text-emerald-600 dark:text-emerald-400">
            {formatDealCurrency(displayValue)}
          </p>
          {!renaming ? (
            <div className="flex shrink-0 items-center gap-1 text-[10px] font-normal leading-none tabular-nums text-muted-foreground">
              <Link
                prefetch
                href={`/inbox?contact=${encodeURIComponent(deal.contactId)}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex size-6 items-center justify-center rounded-md text-foreground/75 outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                title="Abrir conversa no Inbox"
                aria-label={`WhatsApp: abrir conversa com ${deal.contact.name} no Inbox`}
              >
                <WhatsAppLogo className="size-3.5" />
              </Link>
              <span title="Atualizado">{relativeShort(deal.updatedAt)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  pipeline,
  onOpenDetail,
}: {
  stage: Stage;
  deals: DealRow[];
  pipeline: Pipeline & { stages: Stage[] };
  onOpenDetail: (d: DealRow) => void;
}) {
  const [newDealOpen, setNewDealOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const sum = deals.reduce((acc, d) => acc + Number(d.value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      style={columnSurfaceStyle()}
      className={cn(
        "flex h-full min-h-0 w-[min(100vw-2rem,18.75rem)] shrink-0 flex-col overflow-visible rounded-[0.7rem] border border-transparent dark:border-border/40",
        isOver &&
          "ring-2 ring-foreground/12 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[12.5px] font-bold leading-tight text-foreground">
                {stage.name}
              </h3>
              <span className="inline-flex min-h-[1.375rem] min-w-[1.375rem] shrink-0 items-center justify-center rounded-md bg-black/[0.06] px-1.5 text-[10px] font-semibold tabular-nums text-foreground/80 dark:bg-white/10">
                {deals.length}
              </span>
            </div>
            <p className="mt-1 text-[11px] tabular-nums leading-snug text-muted-foreground">
              {sum.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </div>
          <PipelineColumnNewDealHeaderButton
            onClick={() => setNewDealOpen(true)}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1">
        <div
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
          aria-label={`Leads na etapa ${stage.name}`}
        >
          {deals.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              Arraste leads aqui
            </p>
          ) : (
            <div className="flex flex-col gap-3.5 pb-1">
              {deals.map((d) => (
                <DealCard key={d.id} deal={d} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 pt-3">
          <PipelineColumnNewDealFooterTrigger
            onClick={() => setNewDealOpen(true)}
          />
        </div>
      </div>

      <PipelineNewDealDialog
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
        pipeline={pipeline}
        stageId={stage.id}
      />
    </div>
  );
}

export function PipelineBoard({
  pipeline,
  deals,
  dealCustomFieldDefs,
  tenantMembers = [],
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers?: TenantMemberOption[];
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panPointerIdRef = useRef<number | null>(null);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });
  /** Evita pan horizontal do board competir com o arraste do @dnd-kit. */
  const pipelineDndDraggingRef = useRef(false);
  const [isPanningBoard, setIsPanningBoard] = useState(false);

  const [detailDeal, setDetailDeal] = useState<DealRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [optimisticStageByDealId, setOptimisticStageByDealId] = useState<
    Record<string, string>
  >({});
  const [activeDragDeal, setActiveDragDeal] = useState<DealRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const displayedDeals = useMemo(() => {
    return deals.map((d) => {
      const sid = optimisticStageByDealId[d.id];
      return sid ? { ...d, stageId: sid } : d;
    });
  }, [deals, optimisticStageByDealId]);

  const byStage = useMemo(() => {
    const map = new Map<string, DealRow[]>();
    for (const s of pipeline.stages) map.set(s.id, []);
    for (const d of displayedDeals) {
      const list = map.get(d.stageId);
      if (list) list.push(d);
    }
    return map;
  }, [pipeline.stages, displayedDeals]);

  useEffect(() => {
    setOptimisticStageByDealId((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of ids) {
        const server = deals.find((d) => d.id === id);
        if (server && server.stageId === prev[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [deals]);

  const onBoardPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (pipelineDndDraggingRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-pipeline-card]")) return;
      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], [role='menuitem']",
        )
      )
        return;
      const el = scrollRef.current;
      if (!el) return;
      panningRef.current = true;
      panPointerIdRef.current = e.pointerId;
      setIsPanningBoard(true);
      panStartRef.current = { x: e.clientX, scrollLeft: el.scrollLeft };
      el.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onBoardPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pipelineDndDraggingRef.current) return;
      if (!panningRef.current || !scrollRef.current) return;
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.x;
      scrollRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    },
    [],
  );

  const endBoardPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollRef.current || !panningRef.current) return;
    const pid = e.pointerId ?? panPointerIdRef.current ?? undefined;
    if (pid != null) {
      try {
        scrollRef.current.releasePointerCapture(pid);
      } catch {
        /* já liberado */
      }
    }
    panPointerIdRef.current = null;
    panningRef.current = false;
    setIsPanningBoard(false);
  }, []);

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      pipelineDndDraggingRef.current = true;
      if (panningRef.current && scrollRef.current) {
        const pid = panPointerIdRef.current;
        if (pid != null) {
          try {
            scrollRef.current.releasePointerCapture(pid);
          } catch {
            /* já liberado */
          }
        }
        panPointerIdRef.current = null;
        panningRef.current = false;
        setIsPanningBoard(false);
      }
      const id = String(e.active.id);
      const d = displayedDeals.find((x) => x.id === id);
      setActiveDragDeal(d ?? null);
    },
    [displayedDeals],
  );

  const handleDragCancel = useCallback(() => {
    pipelineDndDraggingRef.current = false;
    setActiveDragDeal(null);
  }, []);

  function handleDragEnd(e: DragEndEvent) {
    pipelineDndDraggingRef.current = false;
    setActiveDragDeal(null);
    const dealId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    let targetStageId: string | null = null;
    if (pipeline.stages.some((s) => s.id === overId)) {
      targetStageId = overId;
    } else {
      const overDeal = displayedDeals.find((d) => d.id === overId);
      if (overDeal) targetStageId = overDeal.stageId;
    }
    if (!targetStageId) return;

    const from = displayedDeals.find((d) => d.id === dealId);
    if (!from || from.stageId === targetStageId) return;

    setOptimisticStageByDealId((prev) => ({ ...prev, [dealId]: targetStageId }));

    void (async () => {
      try {
        await moveDealStage(dealId, targetStageId);
        router.refresh();
      } catch {
        setOptimisticStageByDealId((prev) => {
          const next = { ...prev };
          delete next[dealId];
          return next;
        });
      }
    })();
  }

  function openDetail(d: DealRow) {
    setDetailDeal(d);
    setDetailOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={scrollRef}
          role="region"
          aria-label="Etapas do funil: arraste nesta área para rolar horizontalmente ou use a barra de rolagem."
          className={cn(
            "pipeline-board-scroll flex min-h-0 flex-1 gap-3 overflow-x-auto overscroll-x-contain pt-1",
            /* touch-pan-x faz o browser disputar o gesto horizontal com o card; pan continua via pointer events */
            "cursor-grab touch-pan-y",
            isPanningBoard && "cursor-grabbing select-none",
          )}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={endBoardPan}
          onPointerCancel={endBoardPan}
        >
          {pipeline.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              pipeline={pipeline}
              deals={byStage.get(stage.id) ?? []}
              onOpenDetail={openDetail}
            />
          ))}
        </div>
        <DragOverlay zIndex={120} dropAnimation={null}>
          {activeDragDeal ? (
            <DealCardDragOverlayFace deal={activeDragDeal} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <PipelineDealDetailDialog
        deal={detailDeal}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setDetailDeal(null);
        }}
        pipelineName={pipeline.name}
        stages={pipeline.stages}
        dealCustomFieldDefs={dealCustomFieldDefs}
        tenantMembers={tenantMembers}
      />
    </div>
  );
}
