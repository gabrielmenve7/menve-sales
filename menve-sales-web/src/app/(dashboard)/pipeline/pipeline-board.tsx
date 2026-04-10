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
import { PipelineNewDeal } from "./pipeline-new-deal";
import {
  columnSurfaceStyle,
  stageAccentHex,
  stageBadgeStyle,
} from "./pipeline-stage-visual";
import type { DealRow } from "./pipeline-types";

export type { DealRow } from "./pipeline-types";

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

function dealOriginLine(deal: DealRow): string | null {
  const sourceTag =
    deal.contact.campaignSource?.name ?? deal.contact.utmSource ?? null;
  const originParts: string[] = [];
  const seen = new Set<string>();
  if (sourceTag?.trim()) {
    const s = sourceTag.trim();
    seen.add(s);
    originParts.push(s);
  }
  for (const dt of deal.dealTags ?? []) {
    const n = dt.tag.name.trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      originParts.push(n);
    }
  }
  for (const ct of deal.contact.contactTags ?? []) {
    const n = ct.tag.name.trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      originParts.push(n);
    }
  }
  if (originParts.length === 0) return null;
  const head = originParts.slice(0, 2).join(" ");
  const extra = originParts.length - 2;
  return extra > 0 ? `${head} +${extra}` : head;
}

/** Só visual — usado no DragOverlay (fora da coluna com overflow). */
function DealCardDragOverlayFace({ deal }: { deal: DealRow }) {
  const originLine = dealOriginLine(deal);
  return (
    <div className="pointer-events-none w-[min(calc(100vw-2rem-1.5rem),18.25rem)] shrink-0 overflow-hidden rounded-md border border-border/60 bg-card font-sans shadow-lg ring-2 ring-foreground/10">
      <div className="px-3 py-2.5 font-sans">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[15px] font-semibold leading-[1.2] tracking-tight text-foreground">
            {deal.contact.name}
          </p>
          <LeadAssigneeAvatar assignedTo={deal.assignedTo} />
        </div>
        <p className="mt-0.5 text-[12px] font-normal leading-[1.2] text-muted-foreground">
          {deal.contact.company?.trim() || "—"}
        </p>
        {deal.value != null ? (
          <p className="mt-2 text-[15px] font-bold leading-[1.2] tabular-nums tracking-tight text-foreground">
            {Number(deal.value).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-normal leading-none text-muted-foreground">
          <span className="min-w-0 truncate">{originLine ?? "—"}</span>
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
            <span className="flex size-6 items-center justify-center text-emerald-600 dark:text-emerald-500">
              <WhatsAppLogo className="size-3.5" />
            </span>
            <span title="Atualizado">{relativeShort(deal.updatedAt)}</span>
          </span>
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
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-600 dark:bg-violet-500"
      >
        <User className="size-3 text-white/80" strokeWidth={2} />
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
        className="size-6 text-[9px] font-semibold uppercase tracking-tight"
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

  const originLine = dealOriginLine(deal);

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
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={`Lead ${deal.contact.name}. Arraste para mover de etapa ou clique para abrir.`}
      className={cn(
        "group w-full shrink-0 touch-none overflow-hidden rounded-md border border-border/60 bg-card font-sans shadow-sm outline-none transition-[box-shadow,opacity] hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
      <div className="px-3 py-2.5 font-sans">
        <div className="flex items-start justify-between gap-2">
          <div
            className="min-w-0 flex-1"
            onPointerDown={(e) => renaming && e.stopPropagation()}
            onClick={(e) => renaming && e.stopPropagation()}
          >
            {renaming ? (
              <Input
                ref={renameInputRef}
                disabled={renameBusy}
                placeholder="Nome do lead"
                className="h-8 border-0 bg-transparent px-0 text-[15px] font-semibold shadow-none outline-none ring-0 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
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
              <p className="text-[15px] font-semibold leading-[1.2] tracking-tight text-foreground">
                {deal.contact.name}
              </p>
            )}
          </div>
          {!renaming ? (
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
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] font-normal leading-[1.2] text-muted-foreground">
          {deal.contact.company?.trim() || "—"}
        </p>
        {deal.value != null ? (
          <p className="mt-2 text-[15px] font-bold leading-[1.2] tabular-nums tracking-tight text-foreground">
            {Number(deal.value).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-normal leading-none text-muted-foreground">
          <span className="min-w-0 truncate">{originLine ?? "—"}</span>
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
            <Link
              href={`/inbox?contact=${encodeURIComponent(deal.contactId)}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex size-6 items-center justify-center rounded-md text-emerald-600 outline-none transition-colors hover:bg-emerald-600/10 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-500 dark:hover:text-emerald-400"
              title="Abrir conversa no Inbox"
              aria-label={`WhatsApp: abrir conversa com ${deal.contact.name} no Inbox`}
            >
              <WhatsAppLogo className="size-3.5" />
            </Link>
            <span title="Atualizado">{relativeShort(deal.updatedAt)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  stageIndex,
  pipeline,
  contacts,
  onOpenDetail,
}: {
  stage: Stage;
  deals: DealRow[];
  stageIndex: number;
  pipeline: Pipeline & { stages: Stage[] };
  contacts: { id: string; name: string; phone: string | null }[];
  onOpenDetail: (d: DealRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const sum = deals.reduce((acc, d) => acc + Number(d.value ?? 0), 0);
  const accent = stageAccentHex(stage, stageIndex);

  return (
    <div
      ref={setNodeRef}
      style={columnSurfaceStyle(accent)}
      className={cn(
        "flex h-full min-h-0 w-[min(100vw-2rem,20rem)] shrink-0 flex-col overflow-visible rounded-2xl border border-border/35",
        isOver &&
          "ring-2 ring-foreground/12 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-block max-w-[min(100%,11rem)] truncate rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
            style={stageBadgeStyle(accent)}
          >
            {stage.name}
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <div className="mt-1 flex justify-end">
          <span className="text-xs tabular-nums text-muted-foreground">
            {sum.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0">
        <div
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
          aria-label={`Leads na etapa ${stage.name}`}
        >
          {deals.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Arraste leads aqui
            </p>
          ) : (
            <div className="flex flex-col gap-2 pb-1">
              {deals.map((d) => (
                <DealCard key={d.id} deal={d} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 pt-2">
          <PipelineNewDeal
            pipeline={pipeline}
            contacts={contacts}
            defaultStageId={stage.id}
            variant="column"
          />
        </div>
      </div>
    </div>
  );
}

export function PipelineBoard({
  pipeline,
  deals,
  contacts,
  dealCustomFieldDefs,
  tenantMembers = [],
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
  contacts: { id: string; name: string; phone: string | null }[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers?: TenantMemberOption[];
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });
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
      setIsPanningBoard(true);
      panStartRef.current = { x: e.clientX, scrollLeft: el.scrollLeft };
      el.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onBoardPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panningRef.current || !scrollRef.current) return;
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.x;
      scrollRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    },
    [],
  );

  const endBoardPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollRef.current || !panningRef.current) return;
    try {
      scrollRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* já liberado */
    }
    panningRef.current = false;
    setIsPanningBoard(false);
  }, []);

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      const d = displayedDeals.find((x) => x.id === id);
      setActiveDragDeal(d ?? null);
    },
    [displayedDeals],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragDeal(null);
  }, []);

  function handleDragEnd(e: DragEndEvent) {
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
            "pipeline-board-scroll flex min-h-0 flex-1 gap-4 overflow-x-auto overscroll-x-contain pt-1",
            "cursor-grab touch-pan-x",
            isPanningBoard && "cursor-grabbing select-none",
          )}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={endBoardPan}
          onPointerCancel={endBoardPan}
        >
          {pipeline.stages.map((stage, idx) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              stageIndex={idx}
              pipeline={pipeline}
              contacts={contacts}
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
