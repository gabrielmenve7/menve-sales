"use client";

import type { CustomField } from "@prisma/client";
import type { Pipeline, Stage } from "@prisma/client";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchPipelineAutomations } from "@/actions/pipeline-automations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PipelineAutomationsPanel } from "./pipeline-automations-panel";

/** Shell do modal + área de trabalho estilo ClickUp (fundo contínuo escuro). */
const centralDialogClass = cn(
  "flex flex-col gap-0 overflow-hidden border border-zinc-800 bg-[#111] p-0 text-zinc-100 shadow-2xl duration-200",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  "left-[50%] top-[50%] max-h-[min(94vh,920px)] w-[min(100vw-1rem,80rem)] max-w-none translate-x-[-50%] translate-y-[-50%] sm:rounded-lg",
);

export function PipelineAutomationsDialog({
  open,
  onOpenChange,
  pipeline,
  canConfigure,
  dealCustomFieldDefs = [],
  campaignSources = [],
  tenantTags = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline & { stages: Stage[] };
  canConfigure: boolean;
  dealCustomFieldDefs?: CustomField[];
  campaignSources?: { id: string; name: string }[];
  tenantTags?: { id: string; name: string }[];
}) {
  const [rulesRaw, setRulesRaw] = useState<unknown>([]);
  const [loading, setLoading] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPipelineAutomations(pipeline.id);
      setRulesRaw(data);
    } catch {
      setRulesRaw([]);
    } finally {
      setLoading(false);
    }
  }, [pipeline.id]);

  useEffect(() => {
    if (open) void loadRules();
  }, [open, loadRules]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName="bg-black/30 backdrop-blur-md"
        className={centralDialogClass}
      >
        <DialogHeader className="space-y-1 border-b border-zinc-800/80 bg-[#111] px-[3.75rem] pb-4 pt-6 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-zinc-50">
                Automações
              </DialogTitle>
              <p className="text-sm text-zinc-500">
                Localizado em: <span className="text-zinc-400">{pipeline.name}</span>
              </p>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#0e0e0e] px-[3.75rem] pb-6 pt-5">
          {loading ? (
            <p className="text-sm text-zinc-500">Carregando…</p>
          ) : (
            <PipelineAutomationsPanel
              pipeline={pipeline}
              rulesRaw={rulesRaw}
              canConfigure={canConfigure}
              variant="dialog"
              onRulesChanged={() => void loadRules()}
              onCancel={() => onOpenChange(false)}
              dealCustomFieldDefs={dealCustomFieldDefs}
              campaignSources={campaignSources}
              tenantTags={tenantTags}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
