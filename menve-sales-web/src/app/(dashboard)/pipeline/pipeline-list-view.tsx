"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import { ChevronDown, User } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { UserAvatar } from "@/components/user/user-avatar";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { stageSolidPillStyle } from "@/lib/stage-pill-style";
import { cn } from "@/lib/utils";
import { PipelineDealDetailDialog } from "./pipeline-deal-detail-dialog";
import { PipelineNewDeal } from "./pipeline-new-deal";
import { stageAccentHex } from "./pipeline-stage-visual";
import type { DealRow } from "./pipeline-types";

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatListDate(iso: Date | string | null | undefined): string {
  if (iso == null) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const t0 = startOfLocalDay(now);
  const t1 = startOfLocalDay(d);
  const diffDays = Math.round((t0 - t1) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays === 2) return "Anteontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
  });
}

function isOverdue(expectedClose: Date | string | null | undefined): boolean {
  if (!expectedClose) return false;
  const d =
    typeof expectedClose === "string" ? new Date(expectedClose) : expectedClose;
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d) < startOfLocalDay(new Date());
}

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

export function PipelineListView({
  pipeline,
  deals,
  contacts,
  dealCustomFieldDefs,
  tenantMembers = [],
}: {
  pipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
  contacts: { id: string; name: string; phone: string | null }[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers?: TenantMemberOption[];
}) {
  const [detailDeal, setDetailDeal] = useState<DealRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [collapsedStageIds, setCollapsedStageIds] = useState<Set<string>>(
    () => new Set(),
  );

  const sortedStages = useMemo(
    () => [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [pipeline.stages],
  );

  const byStage = useMemo(() => {
    const map = new Map<string, DealRow[]>();
    for (const s of sortedStages) map.set(s.id, []);
    for (const d of deals) {
      const list = map.get(d.stageId);
      if (list) list.push(d);
    }
    return map;
  }, [sortedStages, deals]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1">
      {sortedStages.map((stage, stageIndex) => {
        const accent = stageAccentHex(stage, stageIndex);
        const stageDeals = byStage.get(stage.id) ?? [];
        const collapsed = collapsedStageIds.has(stage.id);

        return (
          <section
            key={stage.id}
            className="overflow-hidden rounded-2xl border border-border/40 bg-card/40"
          >
            <button
              type="button"
              aria-expanded={!collapsed}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/25"
              onClick={() => toggleStage(stage.id)}
            >
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  collapsed && "-rotate-90",
                )}
                strokeWidth={2}
                aria-hidden
              />
              <span
                className={cn(
                  "inline-flex max-w-[min(100%,14rem)] shrink-0 truncate rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                  collapsed
                    ? "border-2 bg-background/60"
                    : "border-0 shadow-sm",
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
              <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {stageDeals.length}
              </span>
            </button>

            {!collapsed ? (
              <div className="border-t border-border/30 px-2 pb-3 pt-1 sm:px-3">
                {stageDeals.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-muted-foreground">
                    Nenhum lead nesta etapa
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pl-1 pr-3 font-semibold">
                            Nome
                          </th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">
                            Responsável
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            Data inicial
                          </th>
                          <th className="px-3 py-2 pr-1 font-semibold">
                            Vencimento
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageDeals.map((deal) => {
                          const dueOver = isOverdue(deal.expectedClose);
                          return (
                            <tr
                              key={deal.id}
                              className="cursor-pointer border-b border-border/25 transition-colors hover:bg-muted/30"
                              onClick={() => openDetail(deal)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openDetail(deal);
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-label={`Abrir lead ${deal.contact.name}`}
                            >
                              <td className="py-2.5 pl-1 pr-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: accent }}
                                    aria-hidden
                                  />
                                  <span className="min-w-0 truncate font-medium text-foreground">
                                    {deal.contact.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className="inline-block max-w-[10rem] truncate rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                  style={stageSolidPillStyle(accent)}
                                >
                                  {stage.name}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <LeadAssigneeAvatar
                                  assignedTo={deal.assignedTo}
                                />
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                                {formatListDate(deal.createdAt)}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2.5 pr-1 tabular-nums",
                                  dueOver
                                    ? "font-semibold text-rose-600 dark:text-rose-400"
                                    : "text-muted-foreground",
                                )}
                              >
                                {formatListDate(deal.expectedClose)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-2 border-t border-border/25 pt-2">
                  <PipelineNewDeal
                    pipeline={pipeline}
                    contacts={contacts}
                    defaultStageId={stage.id}
                    variant="column"
                  />
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

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
