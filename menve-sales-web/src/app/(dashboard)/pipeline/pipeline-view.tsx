"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  GitBranch,
  Info,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";
import { PipelineBoard } from "./pipeline-board";
import {
  createEmptyFilterGroup,
  createEmptyFilterRow,
  createInitialFilterGroups,
  filterDealsByGroups,
  rowIsComplete,
  type PipelineDatePreset,
  type PipelineFilterFieldId,
  type PipelineFilterGroupState,
  type PipelineFilterRowState,
} from "./pipeline-filter-utils";
import type { DealRow } from "./pipeline-types";

const selectClass = cn(
  "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const fieldSelectClass = cn(
  "min-w-[13.5rem] shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const FIELD_LABELS: Record<PipelineFilterFieldId, string> = {
  createdAt: "Data de criação",
  source: "Origem",
  assignee: "Responsável",
};

export function PipelineView({
  pipelines,
  activePipeline,
  deals,
  contacts,
  stats,
  dealCustomFieldDefs,
  tenantMembers,
  campaignSources,
}: {
  pipelines: Pipeline[];
  activePipeline: Pipeline & { stages: Stage[] };
  deals: DealRow[];
  contacts: { id: string; name: string; phone: string | null }[];
  stats: {
    openCount: number;
    openSum: number;
    wonCount: number;
    lostCount: number;
  };
  dealCustomFieldDefs: CustomField[];
  tenantMembers: TenantMemberOption[];
  campaignSources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterGroups, setFilterGroups] = useState<PipelineFilterGroupState[]>(
    createInitialFilterGroups,
  );

  const membersSorted = useMemo(
    () =>
      [...tenantMembers].sort((a, b) => {
        const an = (a.name ?? a.email).toLowerCase();
        const bn = (b.name ?? b.email).toLowerCase();
        return an.localeCompare(bn, "pt-BR");
      }),
    [tenantMembers],
  );

  const hasActiveFilters = useMemo(
    () => filterGroups.some((g) => g.rows.some((r) => rowIsComplete(r))),
    [filterGroups],
  );

  const preFilteredDeals = useMemo(
    () => filterDealsByGroups(deals, filterGroups),
    [deals, filterGroups],
  );

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return preFilteredDeals;
    return preFilteredDeals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.contact.name.toLowerCase().includes(q) ||
        (d.contact.company?.toLowerCase().includes(q) ?? false) ||
        (d.contact.email?.toLowerCase().includes(q) ?? false),
    );
  }, [preFilteredDeals, search]);

  function patchRow(
    groupId: string,
    rowId: string,
    patch: Partial<PipelineFilterRowState>,
  ) {
    setFilterGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          rows: g.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
        };
      }),
    );
  }

  function onRowFieldChange(
    groupId: string,
    rowId: string,
    field: PipelineFilterFieldId,
  ) {
    patchRow(groupId, rowId, {
      field,
      datePreset: "all",
      customFromStr: "",
      customToStr: "",
      sourceValue: "",
      assigneeValue: "",
    });
  }

  function removeRow(groupId: string, rowId: string) {
    setFilterGroups((prev) => {
      const next = prev
        .map((g) => {
          if (g.id !== groupId) return g;
          return { ...g, rows: g.rows.filter((r) => r.id !== rowId) };
        })
        .filter((g) => g.rows.length > 0);
      return next.length === 0 ? createInitialFilterGroups() : next;
    });
  }

  function removeGroup(groupId: string) {
    setFilterGroups((prev) => {
      const next = prev.filter((g) => g.id !== groupId);
      return next.length === 0 ? createInitialFilterGroups() : next;
    });
  }

  function addFilterRow() {
    setFilterGroups((prev) => {
      if (prev.length === 0) return [createEmptyFilterGroup()];
      const next = [...prev];
      const last = next[next.length - 1]!;
      next[next.length - 1] = {
        ...last,
        rows: [...last.rows, createEmptyFilterRow()],
      };
      return next;
    });
  }

  function addGroupedFilter() {
    setFilterGroups((prev) => [...prev, createEmptyFilterGroup()]);
  }

  function addRowToGroup(groupId: string) {
    setFilterGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, rows: [...g.rows, createEmptyFilterRow()] }
          : g,
      ),
    );
  }

  function clearFilters() {
    setFilterGroups(createInitialFilterGroups());
  }

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function renderValueControl(
    groupId: string,
    row: PipelineFilterRowState,
  ): ReactNode {
    switch (row.field) {
      case "createdAt":
        return (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <select
              className={selectClass}
              value={row.datePreset}
              onChange={(e) =>
                patchRow(groupId, row.id, {
                  datePreset: e.target.value as PipelineDatePreset,
                })
              }
              aria-label="Valor da data de criação"
            >
              <option value="all">Selecionar…</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="last7">Últimos 7 dias</option>
              <option value="thisWeek">Esta semana</option>
              <option value="thisMonth">Este mês</option>
              <option value="lastMonth">Mês passado</option>
              <option value="custom">Personalizado</option>
            </select>
            {row.datePreset === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    De
                  </Label>
                  <Input
                    type="date"
                    value={row.customFromStr}
                    onChange={(e) =>
                      patchRow(groupId, row.id, {
                        customFromStr: e.target.value,
                      })
                    }
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Até
                  </Label>
                  <Input
                    type="date"
                    value={row.customToStr}
                    onChange={(e) =>
                      patchRow(groupId, row.id, {
                        customToStr: e.target.value,
                      })
                    }
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      case "source":
        return (
          <select
            className={selectClass}
            value={row.sourceValue}
            onChange={(e) =>
              patchRow(groupId, row.id, { sourceValue: e.target.value })
            }
            aria-label="Origem"
          >
            <option value="">Selecionar origem…</option>
            <option value="__none__">Sem origem</option>
            {campaignSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        );
      case "assignee":
        return (
          <select
            className={selectClass}
            value={row.assigneeValue}
            onChange={(e) =>
              patchRow(groupId, row.id, { assigneeValue: e.target.value })
            }
            aria-label="Responsável"
          >
            <option value="">Selecionar responsável…</option>
            <option value="__unassigned__">Sem responsável</option>
            {membersSorted.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name?.trim() || m.email}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6">
      <header className="shrink-0 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-11 max-w-full min-w-0 items-center gap-2.5 rounded-xl border border-border/50 bg-background px-3.5 text-left text-[14px] shadow-sm outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Selecionar funil de vendas"
                >
                  <GitBranch
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate font-semibold leading-tight text-foreground">
                    {activePipeline.name}
                  </span>
                  <ChevronsUpDown
                    className="size-4 shrink-0 text-muted-foreground opacity-70"
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="w-[min(calc(100vw-2rem),280px)] rounded-xl border border-border/60 bg-background p-1.5 shadow-lg"
              >
                {pipelines.map((p) => {
                  const selected = p.id === activePipeline.id;
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      className="flex cursor-pointer gap-2 rounded-xl px-2.5 py-2.5 focus:bg-muted/80 data-[highlighted]:bg-muted/80"
                      onSelect={() => {
                        router.push(
                          `/pipeline?pipelineId=${encodeURIComponent(p.id)}`,
                        );
                      }}
                    >
                      <GitBranch
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-foreground">
                        {p.name}
                      </span>
                      {p.isDefault ? (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Padrão
                        </span>
                      ) : null}
                      <span
                        className="flex size-4 shrink-0 items-center justify-center"
                        aria-hidden
                      >
                        {selected ? (
                          <Check className="size-4 text-foreground" strokeWidth={2.5} />
                        ) : null}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              href="/settings"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted/60 hover:text-foreground"
              aria-label="Configurações do funil"
            >
              <Settings className="size-[18px]" strokeWidth={1.75} />
            </Link>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] leading-snug">
            <span className="text-muted-foreground">
              {stats.openCount} leads
            </span>
            <span className="font-bold text-foreground">
              {fmt(stats.openSum)} em aberto
            </span>
            <span className="font-medium text-emerald-600 dark:text-emerald-500">
              {stats.wonCount} ganhos
            </span>
            <span className="font-medium text-rose-800 dark:text-rose-400">
              {stats.lostCount} perdidos
            </span>
          </div>
        </div>
        <div className="flex w-full gap-2 lg:w-auto lg:max-w-md lg:shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative h-11 w-11 shrink-0 rounded-xl border-border/50 shadow-sm"
                aria-label="Filtros do pipeline"
              >
                <SlidersHorizontal className="size-[18px]" strokeWidth={2} />
                {hasActiveFilters ? (
                  <span
                    className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(calc(100vw-1.5rem),34rem)] max-w-[calc(100vw-1.5rem)] border-border/60 p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <p className="text-sm font-semibold">Filtros</p>
                <span
                  className="inline-flex text-muted-foreground"
                  title="Dentro de cada grupo, os filtros são combinados com E (todos precisam bater). Entre grupos, usa-se OU (basta um grupo satisfazer)."
                >
                  <Info className="size-3.5" strokeWidth={2} aria-hidden />
                </span>
              </div>

              <div className="mb-3 space-y-3">
                {filterGroups.map((group, gi) => (
                  <div key={group.id}>
                    {gi > 0 ? (
                      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        ou
                      </p>
                    ) : null}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 dark:bg-muted/10">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Grupo {gi + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => removeGroup(group.id)}
                        >
                          Remover grupo
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {group.rows.map((row) => (
                          <div
                            key={row.id}
                            className="flex flex-col gap-2 border-b border-border/30 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-start"
                          >
                            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                              <select
                                className={fieldSelectClass}
                                value={row.field}
                                onChange={(e) =>
                                  onRowFieldChange(
                                    group.id,
                                    row.id,
                                    e.target.value as PipelineFilterFieldId,
                                  )
                                }
                                aria-label="Campo"
                              >
                                {(Object.keys(FIELD_LABELS) as PipelineFilterFieldId[]).map(
                                  (f) => (
                                    <option key={f} value={f}>
                                      {FIELD_LABELS[f]}
                                    </option>
                                  ),
                                )}
                              </select>
                              <span className="flex h-10 shrink-0 items-center px-0.5 text-sm text-muted-foreground">
                                é
                              </span>
                              {renderValueControl(group.id, row)}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-10 shrink-0 self-end text-muted-foreground hover:text-destructive sm:self-start"
                              aria-label="Remover filtro"
                              onClick={() => removeRow(group.id, row.id)}
                            >
                              <Trash2 className="size-4" strokeWidth={2} />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-8 w-full text-xs text-muted-foreground"
                        onClick={() => addRowToGroup(group.id)}
                      >
                        Adicionar filtro neste grupo
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center gap-1.5"
                  onClick={addFilterRow}
                >
                  <Plus className="size-4" strokeWidth={2} />
                  Adicionar filtro
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={addGroupedFilter}
                >
                  Adicionar filtro agrupado
                </Button>
              </div>

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={clearFilters}
                >
                  Limpar filtros
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl border-border/50 bg-background pl-10 text-[14px] shadow-sm placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
      </header>

      <p className="shrink-0 text-[12px] text-muted-foreground">
        Arraste o card para mudar de etapa. Clique no card para abrir o detalhe
        (ganho, perda e demais ações).
      </p>

      <div className="flex min-h-0 flex-1 flex-col">
        <PipelineBoard
          pipeline={activePipeline}
          deals={filteredDeals}
          contacts={contacts}
          dealCustomFieldDefs={dealCustomFieldDefs}
          tenantMembers={tenantMembers}
        />
      </div>
    </div>
  );
}
