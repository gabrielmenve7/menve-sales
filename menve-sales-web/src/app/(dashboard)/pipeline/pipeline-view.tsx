"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { PipelineBoard } from "./pipeline-board";
import type { DealRow } from "./pipeline-types";

export function PipelineView({
  pipelines,
  activePipeline,
  deals,
  contacts,
  stats,
  contactCustomFieldDefs,
  dealCustomFieldDefs,
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
  contactCustomFieldDefs: CustomField[];
  dealCustomFieldDefs: CustomField[];
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
    <div className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {activePipeline.name}
            </h1>
            <Link
              href="/settings"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Configurações do funil"
            >
              <Settings className="size-[18px]" strokeWidth={1.75} />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="pipeline-select" className="sr-only">
              Funil
            </label>
            <select
              id="pipeline-select"
              value={activePipeline.id}
              onChange={(e) => {
                const id = e.target.value;
                router.push(`/pipeline?pipelineId=${encodeURIComponent(id)}`);
              }}
              className="h-9 max-w-full rounded-xl border border-border/60 bg-card px-3 text-[13px] font-medium text-foreground shadow-sm"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " · padrão" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              <strong className="font-semibold text-foreground">
                {stats.openCount}
              </strong>{" "}
              leads
            </span>
            <span className="font-semibold text-foreground">
              {fmt(stats.openSum)} em aberto
            </span>
            <span className="text-emerald-600 dark:text-emerald-500">
              <strong className="font-semibold">{stats.wonCount}</strong> ganhos
            </span>
            <span className="text-rose-600 dark:text-rose-500">
              <strong className="font-semibold">{stats.lostCount}</strong>{" "}
              perdidos
            </span>
          </div>
        </div>
        <div className="relative w-full sm:max-w-sm lg:w-72 lg:shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-border/60 bg-card pl-10 text-[13px] shadow-sm"
          />
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Arraste o card para mudar de etapa. Clique no card para abrir o detalhe
        (ganho, perda e demais ações).
      </p>

      <PipelineBoard
        pipeline={activePipeline}
        deals={filteredDeals}
        contacts={contacts}
        contactCustomFieldDefs={contactCustomFieldDefs}
        dealCustomFieldDefs={dealCustomFieldDefs}
      />
    </div>
  );
}
