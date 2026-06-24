"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Globe,
  List,
  Loader2,
  MapPin,
  Phone,
  Star,
} from "lucide-react";
import type { OutreachStatus } from "@/actions/prospect-lists";
import type { ProspectSearchHistory } from "@/actions/pesquisa";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CaptureResultRow = {
  id: string;
  name: string;
  website: string | null;
  hasWebsite: boolean;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  snippet: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "DISCARDED";
  contactId: string | null;
  outreachStatus?: OutreachStatus | null;
};

type WebsiteFilter = "all" | "with" | "without";

const STATUS_LABELS: Record<
  ProspectSearchHistory["status"],
  { label: string; className: string }
> = {
  RUNNING: {
    label: "Capturando",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  ENRICHING: {
    label: "Enriquecendo",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  DONE: {
    label: "Concluída",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  ERROR: {
    label: "Erro",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
};

const OUTREACH_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  DELIVERED: "Entregue",
  REPLIED: "Respondeu",
  FAILED: "Falhou",
  OPT_OUT: "Opt-out",
};

function displaySegment(s: ProspectSearchHistory): string {
  return s.segment?.trim() || s.query;
}

function CaptureStatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold",
            accent && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  );
}

export function ListaCaptureResults({
  search,
  results,
  loading,
  isRunning,
  onBack,
  onDeleteSearch,
  savedToList,
}: {
  search: ProspectSearchHistory;
  results: CaptureResultRow[];
  loading?: boolean;
  isRunning?: boolean;
  onBack: () => void;
  onDeleteSearch?: () => void;
  savedToList?: boolean;
}) {
  const [textFilter, setTextFilter] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>("all");
  const [minRating, setMinRating] = useState(0);

  const qualifiedCount = results.filter((r) => r.hasWebsite).length;
  const mapsOnlyCount = Math.max(results.length - qualifiedCount, 0);
  const statusCfg = STATUS_LABELS[search.status] ?? STATUS_LABELS.DONE;

  const filtered = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    return results.filter((r) => {
      if (websiteFilter === "with" && !r.hasWebsite) return false;
      if (websiteFilter === "without" && r.hasWebsite) return false;
      if (minRating > 0 && (r.rating ?? 0) < minRating) return false;
      if (q) {
        const haystack = [r.name, r.address, r.phone, r.website, r.snippet]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [results, textFilter, websiteFilter, minRating]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8" onClick={onBack}>
            <ArrowLeft className="size-4" />
            <span className="ml-1">Nova captura</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {displaySegment(search)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {search.city && search.state
                ? `${search.city} - ${search.state}`
                : search.location ?? "—"}{" "}
              · consulta:{" "}
              <span className="font-mono text-xs">{search.query}</span>
            </p>
          </div>
        </div>
        <Badge variant="secondary" className={statusCfg.className}>
          {statusCfg.label}
        </Badge>
      </div>

      {savedToList && search.status === "DONE" ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <List className="size-4" />
              Empresas adicionadas à lista principal automaticamente.
            </span>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/lista">Ver minha lista</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <CaptureStatCard label="Total capturado" value={results.length} />
        <CaptureStatCard
          label="Qualificadas (com site)"
          value={qualifiedCount}
          accent
        />
        <CaptureStatCard label="Somente Maps" value={mapsOnlyCount} />
      </div>

      {search.status === "ERROR" && search.errorMessage ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            Erro na captura: {search.errorMessage}
          </CardContent>
        </Card>
      ) : null}

      {(isRunning || loading) && results.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Captura em andamento. Os resultados aparecem automaticamente…
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, telefone, site..."
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={websiteFilter}
          onChange={(e) => setWebsiteFilter(e.target.value as WebsiteFilter)}
        >
          <option value="all">Todas</option>
          <option value="with">Somente com site</option>
          <option value="without">Somente sem site</option>
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={String(minRating)}
          onChange={(e) => setMinRating(Number(e.target.value))}
        >
          <option value="0">Qualquer nota</option>
          <option value="3">3+ estrelas</option>
          <option value="4">4+ estrelas</option>
          <option value="4.5">4.5+ estrelas</option>
        </select>
        {onDeleteSearch ? (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onDeleteSearch}>
            Excluir captura
          </Button>
        ) : null}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">Avaliação</th>
                <th className="px-3 py-2 font-medium">Qualificação</th>
                <th className="px-3 py-2 font-medium">Disparo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    {isRunning || loading
                      ? "Aguardando resultados…"
                      : "Nenhuma empresa encontrada com os filtros atuais."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">{row.name}</div>
                      {row.snippet ? (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {row.snippet}
                        </div>
                      ) : null}
                      {row.address ? (
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3 shrink-0" />
                          <span>{row.address}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1 text-sm">
                        {(row.phone || row.whatsapp) && (
                          <div className="flex items-center gap-1">
                            <Phone className="size-3 text-muted-foreground" />
                            {row.whatsapp || row.phone}
                          </div>
                        )}
                        {row.website ? (
                          <a
                            href={row.website.startsWith("http") ? row.website : `https://${row.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Globe className="size-3" />
                            Site
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.rating != null ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {row.rating}
                          <span className="text-xs text-muted-foreground">
                            ({row.reviewCount ?? 0})
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.hasWebsite ? (
                        <Badge
                          variant="secondary"
                          className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="size-3" />
                          Qualificada
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Maps</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-muted-foreground">
                        {row.outreachStatus
                          ? (OUTREACH_STATUS_LABELS[row.outreachStatus] ??
                            row.outreachStatus)
                          : "Não disparado"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Mostrando {filtered.length} de {results.length} empresas.
      </p>
    </div>
  );
}
