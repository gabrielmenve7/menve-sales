"use client";

import type { CustomField, Pipeline, Stage, StageLifecycle } from "@prisma/client";
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
import { ChevronDown, ExternalLink, GripVertical, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { moveDealStage } from "@/actions/deals";
import { StageLifecycleRing } from "@/components/pipeline/stage-lifecycle-ring";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { stageSolidPillStyle, normalizedStageHex } from "@/lib/stage-pill-style";
import { cn } from "@/lib/utils";
import { PipelineDealDetailDialog } from "./pipeline-deal-detail-dialog";
import { PipelineListBulkToolbar } from "./pipeline-list-bulk-toolbar";
import type { DealRow } from "./pipeline-types";
import {
  readContactWebsite,
  readDealMeetLink,
  readDealMeetingDueAt,
} from "./pipeline-types";

const STAGE_CHEVRON_MS = 100;
const COL_COUNT = 8;

function dealCompanyLabel(deal: DealRow): string {
  const company = deal.contact.company?.trim();
  if (company) return company;
  const name = deal.contact.name?.trim();
  if (name) return name;
  return deal.title?.trim() || "—";
}

/** Ícone de status (cápsula + ponto) na cor da etapa — estilo ClickUp. */
function LeadStageStatusIcon({ color }: { color: string | null | undefined }) {
  const hex = normalizedStageHex(color);
  return (
    <span
      className="inline-flex h-3.5 w-[1.375rem] shrink-0 items-center rounded-full pl-0.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${hex} 38%, transparent)`,
      }}
      aria-hidden
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: hex }}
      />
    </span>
  );
}

const LIFECYCLE_ACTIVITY: Record<
  StageLifecycle,
  { label: string; className: string }
> = {
  NOT_STARTED: {
    label: "Não iniciado",
    className: "bg-muted text-muted-foreground",
  },
  ACTIVE: {
    label: "Ativo",
    className: "bg-emerald-600 text-white dark:bg-emerald-500",
  },
  DONE: {
    label: "Feito",
    className: "bg-sky-600 text-white dark:bg-sky-500",
  },
  CLOSED: {
    label: "Fechado",
    className: "bg-rose-700 text-white dark:bg-rose-600",
  },
};

function formatPhoneBR(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  const trimmed = raw?.trim();
  return trimmed || "—";
}

function formatListRelativeDate(
  iso: Date | string | null | undefined,
  { withTime = false }: { withTime?: boolean } = {},
): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);

  const timeSuffix = () => {
    if (!withTime) return "";
    const h = d.getHours();
    const m = d.getMinutes();
    if (h === 0 && m === 0) return "";
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? "am" : "pm";
    return m > 0
      ? `, ${h12}:${String(m).padStart(2, "0")}${ampm}`
      : `, ${h12}${ampm}`;
  };

  if (diffDays === 0) return `Hoje${timeSuffix()}`;
  if (diffDays === -1) return "Ontem";
  if (diffDays === 1) return `Amanhã${timeSuffix()}`;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function ListDragOverlayFace({
  deal,
  stageColor,
}: {
  deal: DealRow;
  stageColor?: string | null;
}) {
  const label = dealCompanyLabel(deal);
  return (
    <div className="pointer-events-none flex min-w-[16rem] max-w-[min(100vw-2rem,24rem)] items-center gap-2.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-[13px] shadow-lg ring-2 ring-foreground/10">
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <LeadStageStatusIcon color={stageColor} />
      <p className="min-w-0 flex-1 truncate font-medium text-foreground">
        {label}
      </p>
    </div>
  );
}

function DealListRow({
  deal,
  stage,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: {
  deal: DealRow;
  stage: Stage;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  const phone = formatPhoneBR(deal.contact.phone);
  const companyLabel = dealCompanyLabel(deal);
  const lifecycle = LIFECYCLE_ACTIVITY[stage.lifecycle];
  const website = readContactWebsite(deal.contact);
  const meetLink = readDealMeetLink(deal);
  const meetingAt = readDealMeetingDueAt(deal);

  return (
    <tr
      ref={setNodeRef}
      data-pipeline-list-row
      className={cn(
        "group border-b border-border/10 transition-colors duration-75 hover:bg-muted/15",
        isDragging && "opacity-45",
        isSelected && "bg-muted/10",
      )}
    >
      <td
        className="w-10 align-middle py-2 pl-1 pr-0 sm:pl-2"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          className={cn(
            "size-4 rounded border border-border accent-primary transition-opacity duration-100",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Selecionar ${companyLabel}`}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td
        className={cn(
          "w-8 align-middle px-0 py-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
          (isSelected || isDragging) && "opacity-100",
        )}
      >
        <button
          type="button"
          className="flex size-8 touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Arrastar ${companyLabel} para outra etapa`}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" strokeWidth={2} />
        </button>
      </td>
      <td
        className="cursor-pointer align-middle py-2 pl-1 pr-3"
        onClick={onOpenDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetail();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Abrir lead ${companyLabel}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <LeadStageStatusIcon color={stage.color} />
          <p className="min-w-0 truncate text-[13px] font-medium leading-snug text-foreground">
            {companyLabel}
          </p>
        </div>
      </td>
      <td
        className="cursor-pointer align-middle py-2 pl-2 pr-2 text-[13px] tabular-nums text-foreground/90"
        onClick={onOpenDetail}
      >
        {phone}
      </td>
      <td
        className="cursor-pointer align-middle py-2 pl-2 pr-2 text-[13px] text-foreground/90"
        onClick={onOpenDetail}
      >
        {website ? (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-sky-700 hover:underline dark:text-sky-400"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{website.replace(/^https?:\/\//, "")}</span>
            <ExternalLink className="size-3 shrink-0 opacity-70" />
          </a>
        ) : (
          "—"
        )}
      </td>
      <td
        className="cursor-pointer align-middle py-2 pl-2 pr-2 text-[13px] text-amber-700 dark:text-amber-400"
        onClick={onOpenDetail}
      >
        {formatListRelativeDate(meetingAt, { withTime: true })}
      </td>
      <td
        className="cursor-pointer align-middle py-2 pl-2 pr-2 text-[13px]"
        onClick={onOpenDetail}
      >
        {meetLink ? (
          <a
            href={meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            onClick={(e) => e.stopPropagation()}
          >
            <Video className="size-3.5 shrink-0" />
            Meet
          </a>
        ) : (
          "—"
        )}
      </td>
      <td
        className="cursor-pointer align-middle py-2 pl-2 pr-3 sm:pr-4"
        onClick={onOpenDetail}
      >
        <span
          className={cn(
            "inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-[11px] font-semibold leading-tight",
            lifecycle.className,
          )}
        >
          {lifecycle.label}
        </span>
      </td>
    </tr>
  );
}

function ListStageTbody({
  stage,
  stageDeals,
  collapsed,
  onToggleCollapsed,
  selectedIds,
  setSelectedIds,
  onOpenDetail,
}: {
  stage: Stage;
  stageDeals: DealRow[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenDetail: (d: DealRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <tbody
      ref={setNodeRef}
      className={cn(isOver && "bg-foreground/[0.03]")}
    >
      <tr>
        <td colSpan={COL_COUNT} className="p-0">
          <div className="flex items-center gap-2 py-2.5">
            <button
              type="button"
              aria-expanded={!collapsed}
              className="inline-flex min-h-8 min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onToggleCollapsed}
            >
              <ChevronDown
                className="size-3.5 shrink-0 text-muted-foreground ease-out"
                style={{
                  transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  transition: `transform ${STAGE_CHEVRON_MS}ms ease-out`,
                }}
                strokeWidth={2.5}
                aria-hidden
              />
              <span
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
                style={stageSolidPillStyle(stage.color)}
              >
                <StageLifecycleRing
                  lifecycle={stage.lifecycle}
                  accentHex={stage.color}
                  tone="onAccent"
                  size={14}
                />
                {stage.name}
              </span>
              <span className="shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground">
                {stageDeals.length}
              </span>
            </button>
          </div>
        </td>
      </tr>
      {!collapsed && (
        <>
          <tr className="text-[11px] font-medium text-muted-foreground">
            <th scope="col" className="py-1 pl-1 font-medium sm:pl-2">
              <span className="sr-only">Seleção</span>
            </th>
            <th scope="col" className="py-1 font-medium">
              <span className="sr-only">Arrastar</span>
            </th>
            <th scope="col" className="py-1 pl-1 pr-3 text-left font-medium">
              Nome
            </th>
            <th scope="col" className="py-1 pl-2 pr-2 text-left font-medium">
              WhatsApp
            </th>
            <th scope="col" className="py-1 pl-2 pr-2 text-left font-medium">
              Data inicial
            </th>
            <th scope="col" className="py-1 pl-2 pr-2 text-left font-medium">
              Data de vencimento
            </th>
            <th
              scope="col"
              className="py-1 pl-2 pr-3 text-left font-medium sm:pr-4"
            >
              Atividade
            </th>
          </tr>
          {stageDeals.map((deal) => (
            <DealListRow
              key={deal.id}
              deal={deal}
              stage={stage}
              isSelected={selectedIds.has(deal.id)}
              onToggleSelect={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(deal.id)) next.delete(deal.id);
                  else next.add(deal.id);
                  return next;
                });
              }}
              onOpenDetail={() => onOpenDetail(deal)}
            />
          ))}
        </>
      )}
    </tbody>
  );
}

export function PipelineListView({
  pipeline,
  deals,
  dealCustomFieldDefs,
  tenantMembers = [],
  tenantTags = [],
  toolbarDock = "fixed",
  visibleStageIds = null,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
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
  const [localDealById, setLocalDealById] = useState<Record<string, DealRow>>(
    {},
  );
  const [collapsedStageIds, setCollapsedStageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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

  useEffect(() => {
    setLocalDealById({});
  }, [deals]);

  const onDealPatch = useCallback(
    (dealId: string, fn: (row: DealRow) => DealRow) => {
      setLocalDealById((prevMap) => {
        const server = deals.find((d) => d.id === dealId);
        if (!server) return prevMap;
        const base = prevMap[dealId] ?? server;
        return { ...prevMap, [dealId]: fn(base) };
      });
      setDetailDeal((prev) =>
        prev && prev.id === dealId ? fn(prev) : prev,
      );
    },
    [deals],
  );

  const displayedDeals = useMemo(() => {
    return deals.map((d) => {
      const local = localDealById[d.id];
      const base = local ?? d;
      const sid = optimisticStageByDealId[base.id];
      return sid ? { ...base, stageId: sid } : base;
    });
  }, [deals, localDealById, optimisticStageByDealId]);

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

  const stagesWithDeals = useMemo(() => {
    return stagesForTable.filter(
      (s) => (byStage.get(s.id)?.length ?? 0) > 0,
    );
  }, [stagesForTable, byStage]);

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
        selectedIds.size > 0 && "pb-12",
      )}
    >
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[52rem] table-fixed border-collapse text-[13px]">
            <colgroup>
              <col style={{ width: "2.5rem" }} />
              <col style={{ width: "2rem" }} />
              <col />
              <col style={{ width: "9rem" }} />
              <col style={{ width: "10rem" }} />
              <col style={{ width: "8rem" }} />
              <col style={{ width: "5.5rem" }} />
              <col style={{ width: "7rem" }} />
            </colgroup>
            <thead className="sr-only">
              <tr>
                <th
                  scope="col"
                  className="py-2 pl-3 pr-1 align-middle sm:pl-4"
                >
                  <span className="sr-only">Seleção</span>
                </th>
                <th scope="col" className="px-1 py-2 align-middle">
                  <span className="sr-only">Arrastar</span>
                </th>
                <th scope="col" className="py-2 pl-1 pr-3 align-middle">
                  Nome
                </th>
                <th scope="col" className="py-2 pl-2 pr-2 align-middle">
                  WhatsApp
                </th>
                <th scope="col" className="py-2 pl-2 pr-2 align-middle">
                  Site
                </th>
                <th scope="col" className="py-2 pl-2 pr-2 align-middle">
                  Reunião
                </th>
                <th scope="col" className="py-2 pl-2 pr-2 align-middle">
                  Meet
                </th>
                <th
                  scope="col"
                  className="py-2 pl-2 pr-3 align-middle sm:pr-4"
                >
                  Atividade
                </th>
              </tr>
            </thead>
            {stagesWithDeals.map((stage) => (
              <ListStageTbody
                key={stage.id}
                stage={stage}
                stageDeals={byStage.get(stage.id) ?? []}
                collapsed={collapsedStageIds.has(stage.id)}
                onToggleCollapsed={() => toggleStage(stage.id)}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                onOpenDetail={openDetail}
              />
            ))}
          </table>
        </div>
        <DragOverlay zIndex={120} dropAnimation={null}>
          {activeDragDeal ? (
            <ListDragOverlayFace
              deal={activeDragDeal}
              stageColor={
                sortedStages.find((s) => s.id === activeDragDeal.stageId)?.color
              }
            />
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
        onDealPatch={onDealPatch}
      />
    </div>
  );
}
