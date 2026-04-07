"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronDown, ChevronRight, GripVertical, User } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { moveDealStage } from "@/actions/deals";
import { UserAvatar } from "@/components/user/user-avatar";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { stageSolidPillStyle } from "@/lib/stage-pill-style";
import { cn } from "@/lib/utils";
import { PipelineDealDetailDialog } from "./pipeline-deal-detail-dialog";
import { PipelineNewDeal } from "./pipeline-new-deal";
import { stageAccentHex } from "./pipeline-stage-visual";
import type { DealRow } from "./pipeline-types";

const ROW_TRANSITION_MS = 100;
const STAGE_CHEVRON_MS = 100;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatListDate(iso: Date | string | null | undefined): string {
  if (iso == null) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const t0 = startOfLocalDay(now);
  const t1 = startOfLocalDay(d);
  const diffDays = Math.round((t0 - t1) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays === 2) return "Anteontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
  });
}

function isOverdue(expectedClose: Date | string | null | undefined): boolean {
  if (!expectedClose) return false;
  const d =
    typeof expectedClose === "string" ? new Date(expectedClose) : expectedClose;
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d) < startOfLocalDay(new Date());
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
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600 dark:bg-violet-500"
      >
        <User className="size-3.5 text-white/80" strokeWidth={2} />
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
        className="size-7 text-[10px] font-semibold uppercase tracking-tight"
      />
    </span>
  );
}

function StageSelectAllCheckbox({
  dealIds,
  selectedIds,
  onToggleAll,
}: {
  dealIds: string[];
  selectedIds: Set<string>;
  onToggleAll: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const n = dealIds.length;
  const selectedCount = useMemo(
    () => dealIds.filter((id) => selectedIds.has(id)).length,
    [dealIds, selectedIds],
  );

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.indeterminate = selectedCount > 0 && selectedCount < n;
  }, [selectedCount, n]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      className="size-4 shrink-0 rounded border border-border accent-primary"
      checked={n > 0 && selectedCount === n}
      onChange={onToggleAll}
      aria-label="Selecionar todos os leads desta etapa"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function ListDragOverlayFace({ deal }: { deal: DealRow }) {
  const phone = deal.contact.phone?.trim();
  return (
    <div className="pointer-events-none flex min-w-[16rem] max-w-[min(100vw-2rem,24rem)] items-center gap-3 rounded-md border border-border/60 bg-card px-4 py-2.5 text-[13px] shadow-lg ring-2 ring-foreground/10">
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          {deal.contact.name}
        </p>
        {phone ? (
          <p className="truncate text-xs text-muted-foreground">{phone}</p>
        ) : null}
      </div>
    </div>
  );
}

function DealListRow({
  deal,
  stage,
  accent,
  colSpanDetail,
  isSelected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  onOpenDetail,
}: {
  deal: DealRow;
  stage: Stage;
  accent: string;
  colSpanDetail: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetail: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  const dueOver = isOverdue(deal.expectedClose);
  const phone = deal.contact.phone?.trim();

  return (
    <>
      <tr
        ref={setNodeRef}
        data-pipeline-list-row
        className={cn(
          isDragging && "opacity-45",
        )}
      >
        <td
          className="w-10 py-2.5 pl-2 pr-1 sm:pl-4"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="size-4 rounded border border-border accent-primary"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label={`Selecionar ${deal.contact.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className="w-10 px-1 py-2.5">
          <button
            type="button"
            className="flex size-8 touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Arrastar ${deal.contact.name} para outra etapa`}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" strokeWidth={2} />
          </button>
        </td>
        <td className="w-9 px-0 py-2.5">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
          >
            <ChevronRight
              className="size-4 transition-transform ease-out"
              style={{
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transitionDuration: `${ROW_TRANSITION_MS}ms`,
              }}
              strokeWidth={2}
            />
          </button>
        </td>
        <td
          className="cursor-pointer py-2.5 pl-2 pr-3"
          onClick={onOpenDetail}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenDetail();
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Abrir lead ${deal.contact.name}`}
        >
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <span className="min-w-0 truncate font-medium text-foreground">
              {deal.contact.name}
            </span>
          </div>
        </td>
        <td className="cursor-pointer px-3 py-2.5" onClick={onOpenDetail}>
          <span
            className="inline-block max-w-[10rem] truncate rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={stageSolidPillStyle(accent)}
          >
            {stage.name}
          </span>
        </td>
        <td className="cursor-pointer px-3 py-2" onClick={onOpenDetail}>
          <LeadAssigneeAvatar assignedTo={deal.assignedTo} />
        </td>
        <td
          className="cursor-pointer px-3 py-2.5 tabular-nums text-muted-foreground"
          onClick={onOpenDetail}
        >
          {formatListDate(deal.createdAt)}
        </td>
        <td
          className={cn(
            "cursor-pointer px-3 py-2.5 pr-2 tabular-nums sm:pr-4",
            dueOver
              ? "font-semibold text-rose-600 dark:text-rose-400"
              : "text-muted-foreground",
          )}
          onClick={onOpenDetail}
        >
          {formatListDate(deal.expectedClose)}
        </td>
      </tr>
      <tr aria-hidden={!expanded}>
        <td colSpan={colSpanDetail} className="p-0">
          <div
            className="grid ease-out"
            style={{
              gridTemplateRows: expanded ? "1fr" : "0fr",
              transition: `grid-template-rows ${ROW_TRANSITION_MS}ms ease-out`,
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-0 bg-transparent px-4 pb-2.5 pl-[calc(2rem+2.25rem+2rem+0.5rem)] pt-0 text-[12px] leading-relaxed text-muted-foreground sm:pl-[calc(2.5rem+2.25rem+2.5rem+0.5rem)]">
                {phone ? (
                  <p>
                    <span className="font-medium text-foreground/80">
                      Telefone:{" "}
                    </span>
                    {phone}
                  </p>
                ) : null}
                {deal.contact.email?.trim() ? (
                  <p>
                    <span className="font-medium text-foreground/80">
                      E-mail:{" "}
                    </span>
                    {deal.contact.email.trim()}
                  </p>
                ) : null}
                {deal.contact.company?.trim() ? (
                  <p>
                    <span className="font-medium text-foreground/80">
                      Empresa:{" "}
                    </span>
                    {deal.contact.company.trim()}
                  </p>
                ) : null}
                {!phone && !deal.contact.email?.trim() && !deal.contact.company?.trim() ? (
                  <p>Sem dados extras.</p>
                ) : null}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

const COL_COUNT = 8;

function ListStageSection({
  stage,
  stageIndex,
  stageDeals,
  pipeline,
  contacts,
  collapsed,
  onToggleCollapsed,
  selectedIds,
  setSelectedIds,
  expandedDealIds,
  setExpandedDealIds,
  onOpenDetail,
}: {
  stage: Stage;
  stageIndex: number;
  stageDeals: DealRow[];
  pipeline: Pipeline & { stages: Stage[] };
  contacts: { id: string; name: string; phone: string | null }[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedDealIds: Set<string>;
  setExpandedDealIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenDetail: (d: DealRow) => void;
}) {
  const accent = stageAccentHex(stage, stageIndex);
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const dealIds = useMemo(() => stageDeals.map((d) => d.id), [stageDeals]);

  const toggleAllInStage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn =
        dealIds.length > 0 && dealIds.every((id) => next.has(id));
      if (allOn) {
        for (const id of dealIds) next.delete(id);
      } else {
        for (const id of dealIds) next.add(id);
      }
      return next;
    });
  }, [dealIds, setSelectedIds]);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "overflow-hidden pb-4 transition-shadow duration-75",
        isOver && "ring-2 ring-primary/35 ring-offset-2 ring-offset-background",
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors duration-75 hover:bg-muted/15 sm:px-8"
        onClick={onToggleCollapsed}
      >
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground ease-out"
          style={{
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: `transform ${STAGE_CHEVRON_MS}ms ease-out`,
          }}
          strokeWidth={2}
          aria-hidden
        />
        <span
          className={cn(
            "inline-flex max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
            collapsed ? "border-2 bg-background/60" : "border-0 shadow-sm",
          )}
          style={
            collapsed
              ? {
                  borderColor: accent,
                  color: `color-mix(in srgb, ${accent} 78%, var(--foreground) 22%)`,
                }
              : stageSolidPillStyle(accent)
          }
        >
          {stage.name}
        </span>
        <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
          {stageDeals.length}
        </span>
      </button>

      <div
        className="grid ease-out"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "1fr",
          transition: `grid-template-rows ${STAGE_CHEVRON_MS}ms ease-out`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-3 pt-0.5 sm:px-8">
            {stageDeals.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted-foreground">
                Nenhum lead nesta etapa
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border/15 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 py-2 pl-2 pr-1 sm:pl-4">
                        <StageSelectAllCheckbox
                          dealIds={dealIds}
                          selectedIds={selectedIds}
                          onToggleAll={toggleAllInStage}
                        />
                      </th>
                      <th
                        className="w-10 px-1 py-2 text-center font-semibold"
                        scope="col"
                      >
                        <span className="sr-only">Arrastar</span>
                      </th>
                      <th className="w-9 py-2 font-semibold" scope="col">
                        <span className="sr-only">Expandir</span>
                      </th>
                      <th className="py-2 pl-2 pr-3 font-semibold" scope="col">
                        Nome
                      </th>
                      <th className="px-3 py-2 font-semibold" scope="col">
                        Status
                      </th>
                      <th className="px-3 py-2 font-semibold" scope="col">
                        Responsável
                      </th>
                      <th className="px-3 py-2 font-semibold" scope="col">
                        Data inicial
                      </th>
                      <th className="py-2 pl-3 pr-2 font-semibold sm:pr-4" scope="col">
                        Vencimento
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageDeals.map((deal) => (
                      <DealListRow
                        key={deal.id}
                        deal={deal}
                        stage={stage}
                        accent={accent}
                        colSpanDetail={COL_COUNT}
                        isSelected={selectedIds.has(deal.id)}
                        onToggleSelect={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(deal.id)) next.delete(deal.id);
                            else next.add(deal.id);
                            return next;
                          });
                        }}
                        expanded={expandedDealIds.has(deal.id)}
                        onToggleExpand={() => {
                          setExpandedDealIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(deal.id)) next.delete(deal.id);
                            else next.add(deal.id);
                            return next;
                          });
                        }}
                        onOpenDetail={() => onOpenDetail(deal)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-2 pt-2">
              <PipelineNewDeal
                pipeline={pipeline}
                contacts={contacts}
                defaultStageId={stage.id}
                variant="column"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PipelineListView({
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
  const [detailDeal, setDetailDeal] = useState<DealRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [collapsedStageIds, setCollapsedStageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [expandedDealIds, setExpandedDealIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [optimisticStageByDealId, setOptimisticStageByDealId] = useState<
    Record<string, string>
  >({});
  const [activeDragDeal, setActiveDragDeal] = useState<DealRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const sortedStages = useMemo(
    () => [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [pipeline.stages],
  );

  const displayedDeals = useMemo(() => {
    return deals.map((d) => {
      const sid = optimisticStageByDealId[d.id];
      return sid ? { ...d, stageId: sid } : d;
    });
  }, [deals, optimisticStageByDealId]);

  const byStage = useMemo(() => {
    const map = new Map<string, DealRow[]>();
    for (const s of sortedStages) map.set(s.id, []);
    for (const d of displayedDeals) {
      const list = map.get(d.stageId);
      if (list) list.push(d);
    }
    return map;
  }, [sortedStages, displayedDeals]);

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

  const toggleStage = useCallback((stageId: string) => {
    setCollapsedStageIds((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }, []);

  function openDetail(d: DealRow) {
    setDetailDeal(d);
    setDetailOpen(true);
  }

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-1">
      {selectedIds.size > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-2 text-[13px] sm:px-8">
          <span className="text-muted-foreground">
            {selectedIds.size === 1
              ? "1 lead selecionado"
              : `${selectedIds.size} leads selecionados`}
          </span>
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </button>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {sortedStages.map((stage, stageIndex) => (
          <ListStageSection
            key={stage.id}
            stage={stage}
            stageIndex={stageIndex}
            stageDeals={byStage.get(stage.id) ?? []}
            pipeline={pipeline}
            contacts={contacts}
            collapsed={collapsedStageIds.has(stage.id)}
            onToggleCollapsed={() => toggleStage(stage.id)}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            expandedDealIds={expandedDealIds}
            setExpandedDealIds={setExpandedDealIds}
            onOpenDetail={openDetail}
          />
        ))}
        <DragOverlay zIndex={120} dropAnimation={null}>
          {activeDragDeal ? (
            <ListDragOverlayFace deal={activeDragDeal} />
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
        stages={sortedStages}
        dealCustomFieldDefs={dealCustomFieldDefs}
        tenantMembers={tenantMembers}
      />
    </div>
  );
}
