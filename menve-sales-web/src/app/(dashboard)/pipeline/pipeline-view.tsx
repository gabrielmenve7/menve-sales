"use client";

import type { Pipeline, Stage } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { PipelineBoard, type DealRow } from "./pipeline-board";
import { PipelineNewDeal } from "./pipeline-new-deal";

export function PipelineView({
  pipelines,
  activePipeline,
  deals,
  contacts,
  stats,
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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
            <Link
              href="/settings"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Configurações"
            >
              <Settings className="size-4" strokeWidth={1.75} />
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
                router.push(
                  `/pipeline?pipelineId=${encodeURIComponent(id)}`,
                );
              }}
              className="h-9 max-w-[min(100%,280px)] rounded-md border border-border/60 bg-background px-3 text-[13px] text-foreground"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " · padrão" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              <strong className="font-medium text-foreground">{stats.openCount}</strong>{" "}
              leads
            </span>
            <span>{fmt(stats.openSum)} em aberto</span>
            <span className="text-emerald-600 dark:text-emerald-500">
              <strong className="font-medium">{stats.wonCount}</strong> ganhos
            </span>
            <span className="text-rose-600 dark:text-rose-500">
              <strong className="font-medium">{stats.lostCount}</strong> perdidos
            </span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-border/60 bg-background pl-9 text-[13px]"
            />
          </div>
          <PipelineNewDeal pipeline={activePipeline} contacts={contacts} />
        </div>
      </div>

      <div className="text-[13px] text-muted-foreground">
        Arraste os cards para mover o deal entre etapas. Use o menu (⋯) para ganho ou perda.
      </div>

      <PipelineBoard pipeline={activePipeline} deals={filteredDeals} />
    </div>
  );
}
