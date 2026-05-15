"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  prospectingConvert,
  prospectingConvertBulk,
  prospectingDeleteSearch,
  prospectingGetSearch,
  prospectingLoadMoreWeb,
  prospectingSearch,
} from "@/actions/pesquisa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, MessageCircle, Search, Trash2 } from "lucide-react";
import type { Pipeline, Stage } from "@prisma/client";

type ProspectRow = {
  id: string;
  source: "GOOGLE_SEARCH" | "GOOGLE_MAPS";
  position: number | null;
  name: string;
  website: string | null;
  hasWebsite: boolean;
  phone: string | null;
  address: string | null;
  snippet: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  whatsapp: string | null;
  email: string | null;
  enrichmentData: Record<string, unknown> | null;
  enrichedAt: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "DISCARDED";
  contactId: string | null;
};

type SearchHistory = {
  id: string;
  query: string;
  totalCount: number;
  webExhausted?: boolean;
  createdAt: string;
  user: { name: string | null; email: string | null };
};

type FilterKey = "all" | "site" | "nosite" | "wa";

export function PesquisaClient({
  initialSearches,
  pipelines,
  existingPhones,
}: {
  initialSearches: SearchHistory[];
  pipelines: (Pipeline & { stages: Stage[] })[];
  existingPhones: Set<string>;
}) {
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "GOOGLE_SEARCH" | "GOOGLE_MAPS">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [bulkConverting, setBulkConverting] = useState(false);
  const [convertNotice, setConvertNotice] = useState<{
    type: "error" | "info";
    text: string;
    contactId?: string;
  } | null>(null);
  const router = useRouter();

  const searchMut = useMutation({
    mutationFn: (q: string) => prospectingSearch(q),
    onSuccess: (data) => {
      setActiveSearchId((data.search as { id: string }).id);
      setSelected(new Set());
      router.refresh();
    },
  });

  const statusQ = useQuery({
    queryKey: ["prospect-search", activeSearchId],
    queryFn: () => prospectingGetSearch(activeSearchId!),
    enabled: !!activeSearchId,
    refetchInterval: (q) => (q.state.data?.isComplete ? false : 3000),
  });

  const loadMoreMut = useMutation({
    mutationFn: (id: string) => prospectingLoadMoreWeb(id),
    onSuccess: () => {
      void statusQ.refetch();
      router.refresh();
    },
  });

  useEffect(() => {
    loadMoreMut.reset();
  }, [activeSearchId]);

  const results = (statusQ.data?.results ?? []) as ProspectRow[];
  const totalWithSite = statusQ.data?.totalWithSite ?? 0;
  const enrichedCount = statusQ.data?.enrichedCount ?? 0;
  const isComplete = statusQ.data?.isComplete ?? true;
  const searchMeta = statusQ.data?.search as
    | { webExhausted?: boolean; lastWebPageFetched?: number }
    | undefined;
  const webExhausted = searchMeta?.webExhausted === true;

  const filtered = useMemo(() => {
    let rows = results;
    if (filter === "site") rows = rows.filter((r) => r.hasWebsite);
    if (filter === "nosite") rows = rows.filter((r) => !r.hasWebsite);
    if (filter === "wa") rows = rows.filter((r) => !!r.whatsapp);
    if (sourceFilter === "GOOGLE_SEARCH") {
      rows = rows.filter((r) => {
        const both = !!(r.enrichmentData as { foundInBothSources?: boolean } | null)
          ?.foundInBothSources;
        return r.source === "GOOGLE_SEARCH" || both;
      });
    }
    if (sourceFilter === "GOOGLE_MAPS") {
      rows = rows.filter((r) => r.source === "GOOGLE_MAPS");
    }
    return rows;
  }, [results, filter, sourceFilter]);

  const defaultPipeline =
    pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;

  const toggleSel = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  async function convertToDefaultPipeline(resultId: string, row: ProspectRow) {
    const pid = defaultPipeline?.id;
    if (!pid) {
      setConvertNotice({
        type: "error",
        text: "Nenhum pipeline configurado. Crie um funil em Funil de vendas (botão Configurar).",
      });
      return;
    }
    setConvertNotice(null);
    setConvertingId(resultId);
    try {
      const res = await prospectingConvert({
        resultId,
        pipelineId: pid,
        phoneOverride: pickProspectPhoneForPipeline(row),
      });
      if (!res.ok && "duplicate" in res && res.duplicate) {
        setConvertNotice({
          type: "info",
          text: res.message ?? "Já existe contato com este telefone.",
          contactId: res.contactId,
        });
      } else {
        void statusQ.refetch();
      }
    } catch (e) {
      setConvertNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Falha ao adicionar ao pipeline.",
      });
    } finally {
      setConvertingId(null);
    }
  }

  async function bulkConvertToDefault() {
    const pid = defaultPipeline?.id;
    if (!pid || selected.size === 0) return;
    setConvertNotice(null);
    setBulkConverting(true);
    try {
      const ids = [...selected].filter((id) => {
        const r = results.find((x) => x.id === id);
        return r && r.status !== "CONVERTED";
      });
      if (ids.length === 0) {
        setBulkConverting(false);
        return;
      }
      const out = await prospectingConvertBulk({
        resultIds: ids,
        pipelineId: pid,
      });
      setSelected(new Set());
      void statusQ.refetch();
      const parts: string[] = [];
      if (out.converted > 0) parts.push(`${out.converted} adicionado(s)`);
      if (out.skippedDuplicate > 0) {
        parts.push(`${out.skippedDuplicate} ignorado(s) (duplicata)`);
      }
      if (out.errors.length > 0) {
        setConvertNotice({
          type: "error",
          text: `${parts.join(" · ")} · ${out.errors[0]}`,
        });
      } else if (parts.length > 0) {
        setConvertNotice({ type: "info", text: parts.join(" · ") });
      }
    } catch (e) {
      setConvertNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Falha na conversão em lote.",
      });
    } finally {
      setBulkConverting(false);
    }
  }

  const progressPct =
    totalWithSite > 0 ? Math.round((enrichedCount / totalWithSite) * 100) : 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pesquisa</h1>
        <p className="text-sm text-muted-foreground">
          Encontre empresas no Google e envie para o{" "}
          <strong className="font-medium text-foreground">pipeline padrão</strong>{" "}
          (1º estágio) com origem rastreável — sem confirmação.
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          A <strong className="font-medium text-foreground">1ª leva</strong> traz
          até <strong className="font-medium text-foreground">100</strong>{" "}
          resultados orgânicos do Google, mais o que vier do Maps; em seguida
          removemos duplicatas, notícias e páginas que não parecem empresas — o
          total na tela pode ser um pouco menor. Use{" "}
          <strong className="font-medium text-foreground">Carregar mais +100</strong>{" "}
          na mesma busca para anexar a próxima leva (mais 100 do Google), sem
          repetir domínios que já estão na lista.
        </p>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const q = String(fd.get("q") ?? "").trim();
          if (q.length >= 3) searchMut.mutate(q);
        }}
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="q">Buscar empresas</Label>
          <Input
            id="q"
            name="q"
            placeholder="Ex.: advogado em Florianópolis"
            minLength={3}
            maxLength={200}
            disabled={searchMut.isPending}
          />
        </div>
        <Button type="submit" disabled={searchMut.isPending} className="shrink-0">
          {searchMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          <span className="ml-2">Pesquisar</span>
        </Button>
      </form>

      {searchMut.isError ? (
        <p className="text-sm text-destructive">
          {(searchMut.error as Error)?.message ?? "Erro na busca"}
        </p>
      ) : null}

      {initialSearches.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Buscas recentes
          </p>
          <div className="flex flex-wrap gap-2">
            {initialSearches.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={activeSearchId === s.id ? "secondary" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setActiveSearchId(s.id);
                  setSelected(new Set());
                }}
              >
                {s.query} ({s.totalCount})
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {activeSearchId && statusQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando resultados…</p>
      ) : null}

      {activeSearchId && results.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "Todos"],
                ["site", "Com site"],
                ["nosite", "Sem site"],
                ["wa", "Com WhatsApp"],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={filter === k ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setFilter(k)}
              >
                {label}
              </Button>
            ))}
            <span className="text-muted-foreground">|</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as typeof sourceFilter)
              }
            >
              <option value="all">Todas as fontes</option>
              <option value="GOOGLE_SEARCH">Rede de pesquisa</option>
              <option value="GOOGLE_MAPS">Google Maps</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-destructive"
              onClick={async () => {
                if (!confirm("Excluir esta busca e todos os resultados?")) return;
                await prospectingDeleteSearch(activeSearchId);
                setActiveSearchId(null);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>

          {!isComplete && totalWithSite > 0 ? (
            <div className="rounded-lg border border-border/60 bg-card p-3 text-sm">
              <div className="mb-1 flex justify-between text-muted-foreground">
                <span>Enriquecendo sites…</span>
                <span>
                  {enrichedCount}/{totalWithSite}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary-solid transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={
                !activeSearchId ||
                webExhausted ||
                loadMoreMut.isPending ||
                searchMut.isPending
              }
              onClick={() =>
                activeSearchId && loadMoreMut.mutate(activeSearchId)
              }
            >
              {loadMoreMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              <span className={loadMoreMut.isPending ? "ml-2" : ""}>
                Carregar mais +100 (Google)
              </span>
            </Button>
            {webExhausted ? (
              <span className="text-xs text-muted-foreground">
                Fim dos resultados web para esta consulta no Google.
              </span>
            ) : activeSearchId ? (
              <span className="text-xs text-muted-foreground">
                Cada clique pede mais 100 no Google; domínios repetidos são
                ignorados.
              </span>
            ) : null}
            {loadMoreMut.isError ? (
              <span className="text-xs text-destructive">
                {(loadMoreMut.error as Error)?.message}
              </span>
            ) : null}
            {loadMoreMut.isSuccess && loadMoreMut.data ? (
              <span className="text-xs text-muted-foreground">
                {loadMoreMut.data.added > 0
                  ? `+${loadMoreMut.data.added} novos (total ${loadMoreMut.data.totalCount}).`
                  : loadMoreMut.data.exhausted
                    ? "Sem mais páginas no Google."
                    : "Nenhum link novo nesta leva (já estavam na lista). Clique de novo para buscar a próxima leva de 100."}
              </span>
            ) : null}
          </div>

          {convertNotice ? (
            <p
              className={cn(
                "text-sm",
                convertNotice.type === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {convertNotice.text}
              {convertNotice.contactId ? (
                <>
                  {" "}
                  <Link
                    className="font-medium text-foreground underline"
                    href={`/contacts/${convertNotice.contactId}`}
                  >
                    Ver contato
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
              <span className="text-sm">{selected.size} selecionados</span>
              <Button
                type="button"
                size="sm"
                disabled={
                  bulkConverting || !defaultPipeline?.id || !activeSearchId
                }
                onClick={() => void bulkConvertToDefault()}
              >
                {bulkConverting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                <span className={bulkConverting ? "ml-2" : ""}>
                  Adicionar ao pipeline padrão
                </span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Limpar
              </Button>
            </div>
          ) : null}

          <ul className="space-y-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(r.id)}
                    onChange={() => toggleSel(r.id)}
                    disabled={r.status === "CONVERTED"}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <SourceBadge r={r} />
                      {r.hasWebsite ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          Site
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-rose-500/15 text-rose-700 dark:text-rose-400">
                          Sem site
                        </Badge>
                      )}
                      {r.whatsapp ? (
                        <MessageCircle className="size-4 text-green-600" aria-label="WhatsApp" />
                      ) : null}
                      {r.status === "CONVERTED" ? (
                        <Badge variant="outline">No pipeline</Badge>
                      ) : null}
                    </div>
                    {r.website ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {r.website.replace(/^https?:\/\//, "")}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {r.phone ? <span>{r.phone}</span> : null}
                      {r.whatsapp && r.whatsapp !== r.phone ? (
                        <span>WA: {r.whatsapp}</span>
                      ) : null}
                      {r.email ? <span>{r.email}</span> : null}
                      {r.rating != null ? (
                        <span>
                          ★ {r.rating}
                          {r.reviewCount != null ? ` (${r.reviewCount})` : ""}
                        </span>
                      ) : null}
                    </div>
                    {r.snippet ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {r.snippet}
                      </p>
                    ) : null}
                    {phoneInCrm(r, existingPhones) ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Telefone já no CRM
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {r.website ? (
                        <Button variant="outline" size="sm" className="h-8" asChild>
                          <a href={r.website} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3.5" />
                            Site
                          </a>
                        </Button>
                      ) : null}
                      {r.googleMapsUrl ? (
                        <Button variant="outline" size="sm" className="h-8" asChild>
                          <a href={r.googleMapsUrl} target="_blank" rel="noreferrer">
                            Maps
                          </a>
                        </Button>
                      ) : null}
                      {r.whatsapp ? (
                        <Button variant="outline" size="sm" className="h-8" asChild>
                          <a
                            href={`https://wa.me/${r.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        </Button>
                      ) : null}
                      {r.status !== "CONVERTED" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          disabled={
                            convertingId === r.id ||
                            !defaultPipeline?.id ||
                            !activeSearchId
                          }
                          onClick={() => void convertToDefaultPipeline(r.id, r)}
                        >
                          {convertingId === r.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          <span className={convertingId === r.id ? "ml-2" : ""}>
                            + Pipeline
                          </span>
                        </Button>
                      ) : r.contactId ? (
                        <Button variant="secondary" size="sm" className="h-8" asChild>
                          <Link href={`/contacts/${r.contactId}`}>Ver contato</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : activeSearchId && !statusQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Nenhum resultado nesta busca.</p>
      ) : null}

    </div>
  );
}

function SourceBadge({ r }: { r: ProspectRow }) {
  const both = !!(r.enrichmentData as { foundInBothSources?: boolean } | null)
    ?.foundInBothSources;
  if (both) {
    return (
      <Badge variant="secondary" className="bg-violet-500/15 text-violet-700 dark:text-violet-300">
        Pesquisa + Maps
      </Badge>
    );
  }
  if (r.source === "GOOGLE_MAPS") {
    return (
      <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-300">
        Maps
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-blue-500/15 text-blue-700 dark:text-blue-300">
      Pesquisa
    </Badge>
  );
}

/** Mesma lógica de comparação que o backend (+55 / dígitos). */
function prospectPhoneKey(s: string): string {
  let d = s.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d;
}

function pickProspectPhoneForPipeline(r: ProspectRow): string | undefined {
  const w = r.whatsapp?.trim();
  if (w) return w;
  const p = r.phone?.trim();
  if (p) return p;
  const arr = r.enrichmentData?.phones;
  if (Array.isArray(arr)) {
    for (const x of arr) {
      if (typeof x === "string" && x.trim()) return x.trim();
    }
  }
  const ew = r.enrichmentData as { whatsapp?: string } | null;
  if (typeof ew?.whatsapp === "string" && ew.whatsapp.trim()) {
    return ew.whatsapp.trim();
  }
  return undefined;
}

function phoneInCrm(r: ProspectRow, phones: Set<string>) {
  const keys = new Set(
    [...phones].map(prospectPhoneKey).filter((k) => k.length >= 10),
  );
  const hit = (s: string | null | undefined) => {
    const k = prospectPhoneKey(s || "");
    return k.length >= 10 && keys.has(k);
  };
  if (hit(r.phone)) return true;
  if (hit(r.whatsapp)) return true;
  const arr = r.enrichmentData?.phones;
  if (Array.isArray(arr)) {
    for (const x of arr) {
      if (typeof x === "string" && hit(x)) return true;
    }
  }
  return false;
}
