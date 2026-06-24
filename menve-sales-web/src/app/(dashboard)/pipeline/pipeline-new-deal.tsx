"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { normalizedStageHex } from "@/lib/stage-pill-style";
import type { Pipeline, Stage } from "@prisma/client";

export function PipelineNewDealDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline?: Pipeline & { stages: Stage[] };
  stageId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Adicionar lead na Gestão</DialogTitle>
        <div className="space-y-4 py-2 text-sm text-muted-foreground">
          <p>
            Leads entram na Gestão de leads somente após agendar uma reunião
            com <strong className="text-foreground">Google Meet</strong>.
          </p>
          <p>
            Use o <strong className="text-foreground">Atendimento</strong> para
            qualificar o contato e agendar, ou a{" "}
            <strong className="text-foreground">Agenda</strong> se já tiver o
            contato cadastrado.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/inbox">Ir para Atendimento</Link>
          </Button>
          <Button type="button" asChild>
            <Link href="/agenda">Ir para Agenda</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Botão “+” circular no topo da coluna Kanban (abre o mesmo diálogo que o rodapé). */
export function PipelineColumnNewDealHeaderButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full border border-dashed border-border/80 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
      aria-label="Adicionar lead"
    >
      <Plus className="size-3.5" strokeWidth={2.5} />
    </button>
  );
}

export function PipelineColumnNewDealFooterTrigger({
  stageColor,
  onClick,
}: {
  stageColor?: string | null;
  onClick: () => void;
}) {
  const hex = normalizedStageHex(stageColor);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-center gap-1 rounded-lg border border-dashed py-3 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground",
      )}
      style={{ borderColor: `color-mix(in srgb, ${hex} 40%, var(--border))` }}
    >
      <span
        className="flex size-8 items-center justify-center rounded-full border bg-background/80"
        style={{ borderColor: `color-mix(in srgb, ${hex} 55%, var(--border))` }}
      >
        <Plus className="size-4" strokeWidth={2} />
      </span>
      <span className="text-[7.5px] font-bold uppercase tracking-wide">
        Adicionar
      </span>
    </button>
  );
}

export function PipelineNewDeal({
  pipeline,
  defaultStageId,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  defaultStageId?: string;
}) {
  const [open, setOpen] = useState(false);
  const stageId = defaultStageId ?? pipeline.stages[0]?.id;

  if (!stageId) return null;

  return (
    <>
      <Button type="button" className="shrink-0 font-medium" onClick={() => setOpen(true)}>
        + Novo lead
      </Button>
      <PipelineNewDealDialog
        open={open}
        onOpenChange={setOpen}
        pipeline={pipeline}
        stageId={stageId}
      />
    </>
  );
}
