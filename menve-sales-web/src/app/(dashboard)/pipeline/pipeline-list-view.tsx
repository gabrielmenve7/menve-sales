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
import { PipelineListBulkToolbar } from "./pipeline-list-bulk-toolbar";
import { stageAccentHex } from "./pipeline-stage-visual";
import type { DealRow } from "./pipeline-types";

const ROW_TRANSITION_MS = 100;
const STAGE_CHEVRON_MS = 100;

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

  const phone = deal.contact.phone?.trim();

  return (
    <>
      <tr
        ref={setNodeRef}
        data-pipeline-list-row
        className={cn(
          "transition-colors duration-75 hover:bg-muted/20",
          !expanded && "border-b border-border/15",
          isDragging && "opacity-45",
        )}
      >
        <td
          className="align-middle py-4 pl-3 pr-1 sm:pl-4 sm:pr-1"
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
        <td className="align-middle px-2 py-4">
          <button
            type="button"
            className="flex size-9 touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Arrastar ${deal.contact.name} para outra etapa`}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" strokeWidth={2} />
          </button>
        </td>
        <td className="align-middle px-2 py-4">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
          className="cursor-pointer align-middle py-4 pl-1 pr-3"
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
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <span className="min-w-0 truncate text-[13px] font-medium leading-snug text-foreground">
              {deal.contact.name}
            </span>
          </div>
        </td>
        <td
          className="cursor-pointer align-middle py-4 pl-2 pr-2"
          onClick={onOpenDetail}
        >
          <span
            className="inline-block max-w-full truncate rounded-md px-2 py-1 text-[10px] font-bold uppercase leading-tight tracking-wide"
            style={stageSolidPillStyle(accent)}
          >
            {stage.name}
          </span>
        </td>
        <td
          className="cursor-pointer align-middle py-4 pl-2 pr-3 sm:pr-4"
          onClick={onOpenDetail}
        >
          <div className="flex justify-start">
            <LeadAssigneeAvatar assignedTo={deal.assignedTo} />
          </div>
        </td>
      </tr>
      <tr
        aria-hidden={!expanded}
        className={expanded ? "border-b border-border/15" : undefined}
      >
        <td colSpan={colSpanDetail} className="p-0">
          <div
            className="grid ease-out"
            style={{
              gridTemplateRows: expanded ? "1fr" : "0fr",
              transition: `grid-template-rows ${ROW_TRANSITION_MS}ms ease-out`,
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-0 bg-transparent px-4 pb-4 pl-[8rem] pt-0 text-[12px] leading-relaxed text-muted-foreground sm:pl-[8.5rem]">
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

const COL_COUNT = 6;

/** Alinha barra da etapa com as colunas da tabela (mesmas larguras do colgroup). */
const STAGE_BAR_GRID =
  "grid grid-cols-[3rem_2.25rem_2.25rem_minmax(0,1fr)_10rem_4rem] items-center gap-x-0";

function ListStageTbody({
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
  isFirst,
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
  isFirst: boolean;
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
    <tbody
      ref={setNodeRef}
      className={cn(
        !isFirst && "border-t-2 border-t-border/30",
        isOver && "bg-primary/[0.07]",
      )}
    >
      <tr className="bg-muted/40">
        <td colSpan={COL_COUNT} className="p-0">
          <div className={cn(STAGE_BAR_GRID, "border-b border-border/25 py-4")}>
            <div
              className="flex items-center justify-center pl-3 sm:pl-4"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <StageSelectAllCheckbox
                dealIds={dealIds}
                selectedIds={selectedIds}
                onToggleAll={toggleAllInStage}
              />
            </div>
            <div className="min-w-0" aria-hidden />
            <div className="min-w-0" aria-hidden />
            <button
              type="button"
              aria-expanded={!collapsed}
              className="flex min-h-[2.75rem] min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
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
                  "inline-flex min-w-0 max-w-full truncate rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
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
            </button>
            <div className="min-w-0" aria-hidden />
            <div className="flex justify-end pr-3 sm:pr-4">
              <span className="min-w-[2rem] rounded-md bg-muted/60 px-2.5 py-1 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                {stageDeals.length}
              </span>
            </div>
          </div>
        </td>
      </tr>
      {!collapsed && (
        <>
          {stageDeals.length === 0 ? (
            <tr>
              <td
                colSpan={COL_COUNT}
                className="border-b border-border/20 bg-muted/15 px-4 py-8 text-center text-[13px] leading-relaxed text-muted-foreground"
              >
                Nenhum lead nesta etapa
              </td>
            </tr>
          ) : (
            stageDeals.map((deal) => (
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
            ))
          )}
          <tr className="border-b border-border/25 bg-muted/10">
            <td colSpan={COL_COUNT} className="p-4 pt-3">
              <PipelineNewDeal
                pipeline={pipeline}
                contacts={contacts}
                defaultStageId={stage.id}
                variant="column"
              />
            </td>
          </tr>
        </>
      )}
    </tbody>
  );
}

export function PipelineListView({
  pipeline,
  deals,
  contacts,
  dealCustomFieldDefs,
  tenantMembers = [],
  tenantTags = [],
  toolbarDock = "fixed",
  visibleStageIds = null,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
  contacts: { id: string; name: string; phone: string | null }[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers?: TenantMemberOption[];
  tenantTags?: { id: string; name: string }[];
  toolbarDock?: "fixed" | "inline";
  /** Quando definido e não vazio, exibe apenas essas etapas (ordem do funil preservada). */
  visibleStageIds?: Set<string> | null;
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

  const stagesForTable = useMemo(() => {
    if (!visibleStageIds || visibleStageIds.size === 0) return sortedStages;
    return sortedStages.filter((s) => visibleStageIds.has(s.id));
  }, [sortedStages, visibleStageIds]);

  const stageIndexInPipeline = useMemo(() => {
    const m = new Map<string, number>();
    sortedStages.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [sortedStages]);

  const displayedDeals = useMemo(() => {
    return deals.map((d) => {
      const sid = optimisticStageByDealId[d.id];
      return sid ? { ...d, stageId: sid } : d;
    });
  }, [deals, optimisticStageByDealId]);

  const selectedDeals = useMemo(
    () => displayedDeals.filter((d) => selectedIds.has(d.id)),
    [displayedDeals, selectedIds],
  );

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
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-1",
        toolbarDock === "inline" && "relative min-h-[min(69vh,35rem)]",
        selectedIds.size > 0 && "pb-24",
      )}
    >
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="px-4 pb-4 pt-1 sm:px-8">
          <div className="overflow-x-auto rounded-xl border border-border/40 bg-card/50 shadow-sm">
            <table className="mx-auto w-full max-w-[98rem] min-w-[30rem] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col style={{ width: "3rem" }} />
                <col style={{ width: "2.25rem" }} />
                <col style={{ width: "2.25rem" }} />
                <col />
                <col style={{ width: "10rem" }} />
                <col style={{ width: "4rem" }} />
              </colgroup>
              <thead className="border-b-2 border-border/30 bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th
                    scope="col"
                    className="py-4 pl-3 pr-2 align-middle sm:pl-4"
                  >
                    <span className="sr-only">Seleção por etapa</span>
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-4 align-middle text-center font-semibold"
                  >
                    <span className="sr-only">Arrastar</span>
                  </th>
                  <th scope="col" className="px-2 py-4 align-middle font-semibold">
                    <span className="sr-only">Expandir</span>
                  </th>
                  <th scope="col" className="py-4 pl-1 pr-3 align-middle font-semibold">
                    Nome
                  </th>
                  <th scope="col" className="py-4 pl-2 pr-2 align-middle font-semibold">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="py-4 pl-2 pr-3 align-middle font-semibold sm:pr-4"
                  >
                    Responsável
                  </th>
                </tr>
              </thead>
              {stagesForTable.map((stage, stageIndex) => (
                <ListStageTbody
                  key={stage.id}
                  isFirst={stageIndex === 0}
                  stage={stage}
                  stageIndex={stageIndexInPipeline.get(stage.id) ?? 0}
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
            </table>
          </div>
        </div>
        <DragOverlay zIndex={120} dropAnimation={null}>
          {activeDragDeal ? (
            <ListDragOverlayFace deal={activeDragDeal} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedIds.size > 0 ? (
        <PipelineListBulkToolbar
          selectedDeals={selectedDeals}
          pipeline={pipeline}
          sortedStages={sortedStages}
          tenantMembers={tenantMembers}
          tenantTags={tenantTags}
          dealCustomFieldDefs={dealCustomFieldDefs}
          onClearSelection={() => setSelectedIds(new Set())}
          dock={toolbarDock}
        />
      ) : null}

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
