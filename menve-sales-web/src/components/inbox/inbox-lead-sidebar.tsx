"use client";

import type { CustomField } from "@prisma/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Kanban, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PipelineDealDetailDialog } from "@/app/(dashboard)/pipeline/pipeline-deal-detail-dialog";
import { createDeal } from "@/actions/deals";
import { getNextOpenDealInSameStage } from "@/actions/deal-queue";
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
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { inboxOpenDealToDealRow } from "./inbox-deal-stub";
import type { InboxContact, InboxOpenDeal } from "./inbox-types";

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
  contact,
  deals,
  dealCustomFieldDefs,
  tenantMembers,
  onLeadChanged,
  onOpenContactInInbox,
}: {
  contact: InboxContact;
  deals: InboxOpenDeal[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers: TenantMemberOption[];
  onLeadChanged: () => void;
  onOpenContactInInbox: (contactId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const openDeals = deals ?? [];

  const dealIdsKey = openDeals.map((d) => d.id).join(",");

  useEffect(() => {
    setActiveDealId((prev) => {
      if (openDeals.length === 0) return null;
      if (prev && openDeals.some((d) => d.id === prev)) return prev;
      return openDeals[0]!.id;
    });
  }, [contact.id, dealIdsKey]);

  const activeDeal = useMemo(
    () => openDeals.find((d) => d.id === activeDealId) ?? openDeals[0] ?? null,
    [openDeals, activeDealId],
  );

  const pipelineDealId = activeDeal?.id ?? null;

  const { data: nextInStage, isLoading: nextInStageLoading } = useQuery({
    queryKey: ["deal-next-in-stage", pipelineDealId],
    queryFn: () => getNextOpenDealInSameStage(pipelineDealId!),
    enabled: Boolean(pipelineDealId),
    staleTime: 10_000,
  });

  const canGoToNextInQueue =
    Boolean(pipelineDealId) &&
    !nextInStageLoading &&
    Boolean(nextInStage);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["deal-next-in-stage"] });
    onLeadChanged();
  }, [onLeadChanged, queryClient]);

  const onGoToNextInQueue = useCallback(() => {
    if (!nextInStage) return;
    onOpenContactInInbox(nextInStage.contactId);
  }, [nextInStage, onOpenContactInInbox]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border/20 bg-background dark:border-border/30">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/20 px-3 py-2.5 dark:border-border/30">
        <div className="flex min-w-0 items-center gap-2">
          <Kanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="truncate text-sm font-semibold text-foreground">
            Oportunidade
          </h2>
        </div>
        <button
          type="button"
          disabled={!canGoToNextInQueue}
          title={
            canGoToNextInQueue
              ? "Próximo lead na mesma etapa do funil"
              : !pipelineDealId
                ? "Selecione uma oportunidade aberta"
                : nextInStageLoading
                  ? "Carregando fila da etapa…"
                  : "Não há outro lead nesta etapa"
          }
          onClick={onGoToNextInQueue}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 px-0 text-xs font-medium transition-colors",
            canGoToNextInQueue
              ? "text-muted-foreground hover:text-foreground"
              : "cursor-not-allowed text-muted-foreground/40",
          )}
        >
          <span>Próximo da fila</span>
          <ArrowRight className="size-3.5 shrink-0 opacity-80" aria-hidden />
        </button>
      </div>

      {openDeals.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/15 px-2 py-2 dark:border-border/25">
          {openDeals.map((d) => (
            <Button
              key={d.id}
              type="button"
              size="sm"
              variant={d.id === activeDeal?.id ? "secondary" : "ghost"}
              className={cn(
                "h-8 max-w-[9rem] shrink-0 truncate text-xs",
                d.id === activeDeal?.id && "font-medium",
              )}
              onClick={() => setActiveDealId(d.id)}
            >
              {d.title}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {openDeals.length > 0 && activeDeal ? (
          <PipelineDealDetailDialog
            variant="embedded"
            deal={inboxOpenDealToDealRow(contact, activeDeal)}
            open
            onOpenChange={() => {}}
            pipelineName={activeDeal.pipeline.name}
            stages={[]}
            dealCustomFieldDefs={dealCustomFieldDefs}
            tenantMembers={tenantMembers}
            onInvalidate={onRefresh}
          />
        ) : (
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 dark:border-border/50">
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
          </div>
        )}
      </div>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        contactId={contact.id}
        contactName={contact.name}
        onCreated={onRefresh}
      />
    </aside>
  );
}

export function InboxLeadSidebarEmpty() {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border/20 bg-muted/5 dark:border-border/30">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/20 px-4 py-3 dark:border-border/30">
        <Kanban className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Oportunidade</h2>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
        <p className="text-center text-sm text-muted-foreground">
          Selecione uma conversa para ver ou criar a oportunidade no pipeline.
        </p>
      </div>
    </aside>
  );
}
