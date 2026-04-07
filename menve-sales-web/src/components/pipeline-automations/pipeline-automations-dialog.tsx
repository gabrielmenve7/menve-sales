"use client";

import type { CustomField } from "@prisma/client";
import type { Pipeline, Stage } from "@prisma/client";
import { X } from "lucide-react";
import { useTheme } from "next-themes";
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
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";
import { PipelineAutomationsPanel } from "./pipeline-automations-panel";

const dialogAnim = cn(
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
  tenantMembers = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline & { stages: Stage[] };
  canConfigure: boolean;
  dealCustomFieldDefs?: CustomField[];
  campaignSources?: { id: string; name: string }[];
  tenantTags?: { id: string; name: string }[];
  tenantMembers?: TenantMemberOption[];
}) {
  const { resolvedTheme } = useTheme();
  const dialogChromeDark = resolvedTheme === "dark";

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
        overlayClassName={
          dialogChromeDark
            ? "bg-black/30 backdrop-blur-md"
            : "bg-black/20 backdrop-blur-sm"
        }
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 shadow-2xl duration-200",
          dialogAnim,
          dialogChromeDark
            ? "border border-zinc-800 bg-[#111] text-zinc-100"
            : "border border-border bg-background text-foreground",
        )}
      >
        <DialogHeader
          className={cn(
            "space-y-1 border-b px-[3.75rem] pb-4 pt-6 text-left",
            dialogChromeDark
              ? "border-zinc-800/80 bg-[#111]"
              : "border-border bg-background",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <DialogTitle
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  dialogChromeDark ? "text-zinc-50" : "text-foreground",
                )}
              >
                Automações
              </DialogTitle>
              <p
                className={cn(
                  "text-sm",
                  dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
                )}
              >
                Localizado em:{" "}
                <span
                  className={
                    dialogChromeDark ? "text-zinc-400" : "text-foreground"
                  }
                >
                  {pipeline.name}
                </span>
              </p>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 shrink-0 rounded-md",
                  dialogChromeDark
                    ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-[3.75rem] pb-6 pt-5",
            dialogChromeDark ? "bg-[#0e0e0e]" : "bg-muted/15",
          )}
        >
          {loading ? (
            <p
              className={cn(
                "text-sm",
                dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
              )}
            >
              Carregando…
            </p>
          ) : (
            <PipelineAutomationsPanel
              pipeline={pipeline}
              rulesRaw={rulesRaw}
              canConfigure={canConfigure}
              variant="dialog"
              dialogAppearance={dialogChromeDark ? "dark" : "light"}
              onRulesChanged={() => void loadRules()}
              onCancel={() => onOpenChange(false)}
              dealCustomFieldDefs={dealCustomFieldDefs}
              campaignSources={campaignSources}
              tenantTags={tenantTags}
              tenantMembers={tenantMembers}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
