"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, GitBranch, Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PipelineBoard } from "./pipeline-board";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import type { DealRow } from "./pipeline-types";

export function PipelineView({
  pipelines,
  activePipeline,
  deals,
  contacts,
  stats,
  dealCustomFieldDefs,
  tenantMembers,
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
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.contact.name.toLowerCase().includes(q) ||
        (d.contact.company?.toLowerCase().includes(q) ?? false) ||
        (d.contact.email?.toLowerCase().includes(q) ?? false),
    );
  }, [deals, search]);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
        <div className="relative w-full lg:w-80 lg:max-w-md lg:shrink-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-border/50 bg-background pl-10 text-[14px] shadow-sm placeholder:text-muted-foreground/70"
          />
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
