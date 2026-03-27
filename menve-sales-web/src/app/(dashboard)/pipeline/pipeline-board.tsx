"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { CampaignSource, Contact, Deal, Pipeline, Stage } from "@prisma/client";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { markDealLost, markDealWon, moveDealStage } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type DealRow = Deal & {
  contact: Contact & { campaignSource: CampaignSource | null };
  stage: Stage;
};

const COLUMN_SURFACE = [
  "border-border/50 bg-muted/25 dark:bg-muted/20",
  "border-border/50 bg-muted/35 dark:bg-muted/25",
  "border-border/50 bg-muted/30 dark:bg-muted/18",
  "border-border/50 bg-muted/40 dark:bg-muted/22",
  "border-border/50 bg-muted/20 dark:bg-muted/15",
];

function columnClass(index: number) {
  return COLUMN_SURFACE[index % COLUMN_SURFACE.length];
}

function DealCard({ deal }: { deal: DealRow }) {
  const router = useRouter();
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  async function onWon() {
    setPending(true);
    try {
      await markDealWon(deal.id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onLostSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = reason.trim();
    if (r.length < 2) return;
    setPending(true);
    try {
      await markDealLost(deal.id, r);
      setLostOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const tag =
    deal.contact.campaignSource?.name ??
    deal.contact.utmSource ??
    null;

  return (
    <div className="rounded-lg border border-border/60 bg-card text-sm shadow-sm">
      <div className="flex flex-row">
        <div
          ref={setNodeRef}
          style={style}
          {...listeners}
          {...attributes}
          className={cn(
            "min-w-0 flex-1 cursor-grab p-3 active:cursor-grabbing",
            isDragging && "opacity-50",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug text-foreground">
                {deal.contact.name}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {deal.contact.company?.trim() || "—"}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-muted-foreground line-clamp-2">
                {deal.title}
              </p>
            </div>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
              {deal.contact.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
          {deal.value != null ? (
            <p className="mt-2 text-sm font-semibold text-foreground">
              {Number(deal.value).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          ) : null}
          {tag ? (
            <span className="mt-2 inline-block rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ) : null}
          <Link
            href={`/contacts/${deal.contactId}`}
            className="mt-2 block text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Ver contato
          </Link>
        </div>
        <div
          className="flex shrink-0 flex-col border-l border-border/50 p-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                disabled={pending}
                aria-label="Ações do deal"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => void onWon()}
                disabled={pending}
              >
                Marcar como ganho
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLostOpen(true)}
                disabled={pending}
              >
                Marcar como perdido…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent
          onPointerDown={(e) => e.stopPropagation()}
          className="sm:max-w-md"
        >
          <form onSubmit={onLostSubmit}>
            <DialogHeader>
              <DialogTitle>Marcar como perdido</DialogTitle>
              <DialogDescription>
                Informe o motivo da perda (obrigatório para análise de campanha).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor={`lost-${deal.id}`}>Motivo</Label>
              <textarea
                id={`lost-${deal.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Ex: preço, concorrente, sem resposta…"
                required
                minLength={2}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || reason.trim().length < 2}>
                {pending ? "Salvando…" : "Confirmar perda"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  stageIndex,
}: {
  stage: Stage;
  deals: DealRow[];
  stageIndex: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const sum = deals.reduce((acc, d) => acc + Number(d.value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[420px] w-72 shrink-0 flex-col rounded-xl border p-3",
        stage.color
          ? "border-l-[4px] bg-muted/15 dark:bg-muted/10"
          : columnClass(stageIndex),
        isOver && "ring-2 ring-foreground/15 dark:ring-white/20",
      )}
      style={
        stage.color
          ? { borderLeftColor: stage.color, borderLeftStyle: "solid" }
          : undefined
      }
    >
      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
            {stage.name}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {sum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  pipeline,
  deals,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
  }

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {pipeline.stages.map((stage, idx) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            stageIndex={idx}
            deals={byStage.get(stage.id) ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? (
          <div className="rounded-lg border border-border/60 bg-card p-3 text-sm shadow-lg">
            <p className="font-medium">{activeDeal.contact.name}</p>
            <p className="text-xs text-muted-foreground">{activeDeal.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
