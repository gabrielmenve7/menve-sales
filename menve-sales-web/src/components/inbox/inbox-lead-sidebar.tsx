"use client";

import type { CustomField } from "@prisma/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Calendar, Kanban } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PipelineDealDetailDialog } from "@/app/(dashboard)/pipeline/pipeline-deal-detail-dialog";
import { getNextOpenDealInSameStage } from "@/actions/deal-queue";
import { ScheduleMeetDialog } from "@/components/schedule-meet-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { inboxOpenDealToDealRow } from "./inbox-deal-stub";
import type { InboxContact, InboxOpenDeal } from "./inbox-types";

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
  onOpenContactInInbox: (contactId: string) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
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

  const {
    data: queuePayload,
    isLoading: nextInStageLoading,
    isError: nextInStageError,
  } = useQuery({
    queryKey: ["deal-next-in-stage", pipelineDealId],
    queryFn: () => getNextOpenDealInSameStage(pipelineDealId!),
    enabled: Boolean(pipelineDealId),
    staleTime: 0,
    gcTime: 120_000,
  });

  const nextInStage = queuePayload?.next ?? null;
  const queueMeta = queuePayload?.queueMeta;

  const canGoToNextInQueue =
    Boolean(pipelineDealId) &&
    !nextInStageLoading &&
    !nextInStageError &&
    Boolean(nextInStage) &&
    (queueMeta?.total ?? 0) > 1 &&
    (queueMeta?.position ?? 0) >= 1;

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["deal-next-in-stage"] });
    onLeadChanged();
  }, [onLeadChanged, queryClient]);

  const onGoToNextInQueue = useCallback(() => {
    if (!nextInStage) return;
    onOpenContactInInbox(nextInStage.contactId);
    void queryClient.invalidateQueries({ queryKey: ["deal-next-in-stage"] });
  }, [nextInStage, onOpenContactInInbox, queryClient]);

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
              ? queueMeta
                ? `Próximo na etapa (${queueMeta.position} de ${queueMeta.total}), só leads com telefone no WhatsApp. No último, volta ao primeiro da fila.`
                : "Próximo lead na mesma etapa (com telefone), ordem do quadro"
              : !pipelineDealId
                ? "Selecione uma oportunidade aberta"
                : nextInStageLoading
                  ? "Carregando…"
                  : nextInStageError
                    ? "Não foi possível carregar a fila. Atualize a página."
                    : queueMeta && queueMeta.total > 1 && queueMeta.position < 1
                      ? "Fora da fila com telefone nesta etapa — cadastre telefone ou atualize o WhatsApp"
                      : queueMeta && queueMeta.total === 0
                        ? "Esta oportunidade não está em aberto no servidor — atualize o WhatsApp ou confira o funil"
                      : queueMeta && queueMeta.total === 1
                        ? "Só há um lead com telefone nesta etapa neste funil (demais estão sem WhatsApp)"
                      : !queueMeta
                        ? "Fila indisponível — confira se a API está atualizada"
                        : "Carregando fila…"
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
                Este contato está em qualificação. Agende uma reunião com Google
                Meet para levá-lo à Gestão de leads.
              </p>
              <Button
                type="button"
                className="w-full font-medium"
                onClick={() => setScheduleOpen(true)}
              >
                <Calendar className="mr-2 size-4" aria-hidden />
                Agendar reunião
              </Button>
              <Button type="button" variant="outline" className="w-full" asChild>
                <Link href={`/agenda?contact=${encodeURIComponent(contact.id)}`}>
                  Abrir na Agenda
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScheduleMeetDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        contactId={contact.id}
        contactName={contact.name}
        onScheduled={() => onRefresh()}
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
