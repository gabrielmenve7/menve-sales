"use client";

import { useQuery } from "@tanstack/react-query";
import { Kanban, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createDeal } from "@/actions/deals";
import {
  fetchPipelinesListForInbox,
  type InboxPipelineListItem,
} from "@/actions/inbox-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { InboxOpenDeal } from "./inbox-types";

function formatBrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function DealSummaryCard({ deal }: { deal: InboxOpenDeal }) {
  const money = formatBrl(deal.value);
  const pipelineHref = `/pipeline?pipelineId=${encodeURIComponent(deal.pipeline.id)}`;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 dark:border-border/40">
      <p className="text-sm font-medium leading-snug text-foreground">
        {deal.title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{deal.pipeline.name}</span>
        <span aria-hidden>·</span>
        <span
          className={cn(
            "inline-flex max-w-full items-center rounded-md px-2 py-0.5 font-medium text-foreground/90",
            deal.stage.color
              ? "text-white"
              : "bg-muted text-muted-foreground dark:bg-muted/80",
          )}
          style={
            deal.stage.color
              ? { backgroundColor: deal.stage.color }
              : undefined
          }
        >
          {deal.stage.name}
        </span>
      </div>
      {money ? (
        <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">
          {money}
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 h-8 w-full text-xs font-medium"
        asChild
      >
        <Link href={pipelineHref}>Ver no pipeline</Link>
      </Button>
    </div>
  );
}

function CreateLeadDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string;
  contactName: string;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");

  const { data: pipelines = [], isLoading: pipelinesLoading } = useQuery({
    queryKey: ["inbox-pipelines-new-deal"],
    queryFn: fetchPipelinesListForInbox,
    enabled: open,
    staleTime: 60_000,
  });

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId),
    [pipelines, pipelineId],
  );

  useEffect(() => {
    if (!open || pipelines.length === 0) return;
    const next =
      pipelines.find((p) => p.isDefault) ?? (pipelines[0] as InboxPipelineListItem);
    setPipelineId((prev) => {
      if (prev && pipelines.some((p) => p.id === prev)) return prev;
      return next.id;
    });
  }, [open, pipelines]);

  useEffect(() => {
    const stages = activePipeline?.stages ?? [];
    const first = stages[0]?.id ?? "";
    setStageId((prev) => {
      if (prev && stages.some((s) => s.id === prev)) return prev;
      return first;
    });
  }, [activePipeline]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const valueRaw = String(fd.get("value") ?? "").trim();
    const value = valueRaw ? Number(valueRaw.replace(",", ".")) : undefined;
    if (!title || !pipelineId || !stageId) return;
    setLoading(true);
    try {
      await createDeal({
        contactId,
        pipelineId,
        stageId,
        title,
        value: Number.isFinite(value) ? value : undefined,
      });
      onOpenChange(false);
      e.currentTarget.reset();
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  const noPipelines = !pipelinesLoading && pipelines.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Novo lead no pipeline</DialogTitle>
            <DialogDescription>
              Contato: <strong>{contactName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {pipelinesLoading ? (
              <p className="text-sm text-muted-foreground">Carregando funis…</p>
            ) : null}
            {noPipelines ? (
              <p className="text-sm text-muted-foreground">
                Nenhum funil configurado. Crie um funil em{" "}
                <Link
                  href="/settings"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Configurações
                </Link>
                .
              </p>
            ) : null}
            {!pipelinesLoading && !noPipelines ? (
              <>
                <input type="hidden" name="contactId" value={contactId} />
                <div className="grid gap-2">
                  <Label htmlFor="inbox-deal-pipeline">Funil</Label>
                  <select
                    id="inbox-deal-pipeline"
                    name="pipelineId"
                    required
                    value={pipelineId}
                    onChange={(ev) => setPipelineId(ev.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isDefault ? " (padrão)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inbox-deal-stage">Etapa</Label>
                  <select
                    id="inbox-deal-stage"
                    name="stageId"
                    required
                    value={stageId}
                    onChange={(ev) => setStageId(ev.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {(activePipeline?.stages ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inbox-deal-title">Título da oportunidade</Label>
                  <Input
                    id="inbox-deal-title"
                    name="title"
                    required
                    placeholder="Ex: Proposta comercial"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inbox-deal-value">Valor (opcional)</Label>
                  <Input
                    id="inbox-deal-value"
                    name="value"
                    inputMode="decimal"
                    placeholder="15000"
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || pipelinesLoading || noPipelines || !stageId}
            >
              {loading ? "Criando…" : "Criar lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InboxLeadSidebar({
  contactId,
  contactName,
  deals,
  onLeadCreated,
}: {
  contactId: string;
  contactName: string;
  deals: InboxOpenDeal[];
  onLeadCreated: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const openDeals = deals ?? [];

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border/20 bg-background dark:border-border/30">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/20 px-4 py-3 dark:border-border/30">
        <Kanban className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {openDeals.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {openDeals.length === 1
                ? "Lead no funil"
                : "Leads abertos neste contato"}
            </p>
            <div className="flex flex-col gap-3">
              {openDeals.map((d) => (
                <DealSummaryCard key={d.id} deal={d} />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full text-xs font-medium"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 size-3.5" aria-hidden />
              Adicionar outro lead
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 dark:border-border/50">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Este contato ainda não tem oportunidade aberta no pipeline.
            </p>
            <Button
              type="button"
              className="w-full font-medium"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              Criar lead no pipeline
            </Button>
          </div>
        )}
      </div>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        contactId={contactId}
        contactName={contactName}
        onCreated={onLeadCreated}
      />
    </aside>
  );
}

export function InboxLeadSidebarEmpty() {
  return (
    <aside className="flex h-full w-full flex-col border-l border-border/20 bg-muted/5 dark:border-border/30">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/20 px-4 py-3 dark:border-border/30">
        <Kanban className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center text-sm text-muted-foreground">
          Selecione uma conversa para ver ou criar o lead no pipeline.
        </p>
      </div>
    </aside>
  );
}
