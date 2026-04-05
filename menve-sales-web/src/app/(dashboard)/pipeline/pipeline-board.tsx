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
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { moveDealStage } from "@/actions/deals";
import { cn } from "@/lib/utils";
import { PipelineDealDetailDialog } from "./pipeline-deal-detail-dialog";
import { PipelineNewDeal } from "./pipeline-new-deal";
import type { DealRow } from "./pipeline-types";

export type { DealRow } from "./pipeline-types";

/** Cor de acento quando a etapa não tem `color` no banco (B2B / qualificação / etc.) */
const FALLBACK_STAGE_HEX = [
  "#2563eb",
  "#7c3aed",
  "#d97706",
  "#e11d48",
  "#059669",
  "#0284c7",
];

function stageAccentHex(stage: Stage, index: number) {
  const c = stage.color?.trim();
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) return c;
  return FALLBACK_STAGE_HEX[index % FALLBACK_STAGE_HEX.length];
}

/** Coluna: quase a cor da página, só um fio da cor da etapa */
function columnSurfaceStyle(hex: string) {
  return {
    backgroundColor: `color-mix(in srgb, var(--background) 98.5%, ${hex} 1.5%)`,
  } as const;
}

/** Badge do título: fundo pastel + texto forte na mesma família de cor */
function stageBadgeStyle(hex: string) {
  return {
    backgroundColor: `color-mix(in srgb, var(--card) 78%, ${hex} 22%)`,
    color: `color-mix(in srgb, ${hex} 72%, var(--foreground) 28%)`,
  } as const;
}

function assigneeInitials(
  user: { name: string | null; email?: string | null } | null,
): string {
  if (!user) return "";
  const n = user.name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]![0];
      const b = parts[parts.length - 1]![0];
      return `${a}${b}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const e = user.email?.trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return "";
}

/** Avatar do responsável (modelo CRM: canto superior direito). Sem foto no banco: iniciais. */
function LeadAssigneeAvatar({
  assignedTo,
}: {
  assignedTo: DealRow["assignedTo"];
}) {
  const label = assigneeInitials(assignedTo);
  const title =
    assignedTo?.name?.trim() ||
    assignedTo?.email?.trim() ||
    "Sem responsável";

  return (
    <span
      title={title}
      aria-label={assignedTo ? `Responsável: ${title}` : "Sem responsável"}
      className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-600 text-[10px] font-semibold uppercase tracking-tight text-white dark:bg-violet-500"
    >
      {assignedTo ? (
        label ? (
          label
        ) : (
          <User className="size-3.5 text-white" strokeWidth={2} />
        )
      ) : (
        <User className="size-3.5 text-white/80" strokeWidth={2} />
      )}
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
  const suppressOpenRef = useRef(false);

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

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

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
  const originLine = (() => {
    if (originParts.length === 0) return null;
    const head = originParts.slice(0, 2).join(" ");
    const extra = originParts.length - 2;
    return extra > 0 ? `${head} +${extra}` : head;
  })();

  function onCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenDetail(deal);
    }
  }

  function handleCardClick() {
    if (suppressOpenRef.current) return;
    onOpenDetail(deal);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={`Lead ${deal.contact.name}. Arraste para mover de etapa ou clique para abrir.`}
      className={cn(
        "w-full touch-none overflow-hidden rounded-[10px] border border-border/60 bg-card font-sans shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDragging
          ? "cursor-grabbing opacity-60 ring-2 ring-foreground/10"
          : "cursor-grab active:cursor-grabbing",
      )}
      onClick={handleCardClick}
      onKeyDown={onCardKeyDown}
    >
      <div className="p-4 font-sans">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-[16px] font-semibold leading-tight tracking-normal text-foreground">
            {deal.contact.name}
          </p>
          <LeadAssigneeAvatar assignedTo={deal.assignedTo} />
        </div>
        <p className="mt-0 text-[13px] font-normal leading-[1.25] tracking-normal text-zinc-500 dark:text-zinc-400">
          {deal.contact.company?.trim() || "—"}
        </p>
        {deal.value != null ? (
          <p className="mt-[14px] text-[16px] font-bold leading-tight tabular-nums tracking-normal text-foreground">
            {Number(deal.value).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
        ) : null}
        <p className="mt-[14px] text-[12px] font-normal leading-normal tracking-normal text-zinc-400 dark:text-zinc-500">
          {originLine ?? "—"}
        </p>
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
        "flex w-[min(100vw-2rem,20rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/35",
        isOver &&
          "ring-2 ring-foreground/12 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="px-3 pb-2 pt-3">
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

      <div className="flex min-h-[min(420px,50vh)] flex-1 flex-col gap-3 px-3 pb-3 pt-0">
        {deals.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Arraste leads aqui
          </p>
        ) : (
          deals.map((d) => (
            <DealCard key={d.id} deal={d} onOpenDetail={onOpenDetail} />
          ))
        )}
        <PipelineNewDeal
          pipeline={pipeline}
          contacts={contacts}
          defaultStageId={stage.id}
          variant="column"
        />
      </div>
    </div>
  );
}

export function PipelineBoard({
  pipeline,
  deals,
  contacts,
  contactCustomFieldDefs,
  dealCustomFieldDefs,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
  contacts: { id: string; name: string; phone: string | null }[];
  contactCustomFieldDefs: CustomField[];
  dealCustomFieldDefs: CustomField[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailDeal, setDetailDeal] = useState<DealRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const byStage = useMemo(() => {
    const map = new Map<string, DealRow[]>();
    for (const s of pipeline.stages) map.set(s.id, []);
    for (const d of deals) {
      const list = map.get(d.stageId);
      if (list) list.push(d);
    }
    return map;
  }, [pipeline.stages, deals]);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    let targetStageId: string | null = null;
    if (pipeline.stages.some((s) => s.id === overId)) {
      targetStageId = overId;
    } else {
      const overDeal = deals.find((d) => d.id === overId);
      if (overDeal) targetStageId = overDeal.stageId;
    }
    if (!targetStageId) return;

    const from = deals.find((d) => d.id === dealId);
    if (!from || from.stageId === targetStageId) return;

    await moveDealStage(dealId, targetStageId);
    router.refresh();
  }

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  function openDetail(d: DealRow) {
    setDetailDeal(d);
    setDetailOpen(true);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
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
        <DragOverlay>
          {activeDeal ? (
            <div className="w-[min(100vw-2rem,18rem)] rounded-[10px] border border-border/60 bg-card p-4 font-sans shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-[16px] font-semibold leading-tight text-foreground">
                  {activeDeal.contact.name}
                </p>
                <LeadAssigneeAvatar assignedTo={activeDeal.assignedTo} />
              </div>
              <p className="mt-0 text-[13px] font-normal leading-[1.25] text-zinc-500 dark:text-zinc-400">
                {activeDeal.contact.company?.trim() || "—"}
              </p>
              {activeDeal.value != null ? (
                <p className="mt-[14px] text-[16px] font-bold leading-tight tabular-nums text-foreground">
                  {Number(activeDeal.value).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              ) : null}
            </div>
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
        contactCustomFieldDefs={contactCustomFieldDefs}
        dealCustomFieldDefs={dealCustomFieldDefs}
      />
    </>
  );
}
