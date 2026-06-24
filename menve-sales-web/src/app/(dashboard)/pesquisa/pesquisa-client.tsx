"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  prospectingDeleteSearch,
  prospectingGetSearch,
  prospectingSearch,
  type ProspectSearchHistory,
  type ProspectStats,
} from "@/actions/pesquisa";
import {
  getPrimaryProspectList,
  type PrimaryProspectListDetail,
} from "@/actions/prospect-lists";
import {
  ListaCaptureForm,
  type CaptureFormPayload,
} from "@/components/lista/lista-capture-form";
import {
  ListaCaptureResults,
  type CaptureResultRow,
} from "@/components/lista/lista-capture-results";
import { ListaHistoryDialog } from "@/components/lista/lista-history-dialog";
import { ListaPrincipalPanel } from "@/components/lista/lista-principal-panel";
import { ListaStatsCards } from "@/components/lista/lista-stats-cards";
import { ProspeccaoTabs } from "@/components/prospeccao/prospeccao-tabs";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import type { OutreachStatus } from "@/actions/prospect-lists";

type ProspectRow = CaptureResultRow & {
  enrichmentData?: Record<string, unknown> | null;
  outreachStatus?: OutreachStatus | null;
};

function toCaptureRow(r: ProspectRow): CaptureResultRow {
  return {
    id: r.id,
    name: r.name,
    website: r.website,
    hasWebsite: r.hasWebsite,
    phone: r.phone,
    whatsapp: r.whatsapp,
    address: r.address,
    snippet: r.snippet,
    rating: r.rating,
    reviewCount: r.reviewCount,
    googleMapsUrl: r.googleMapsUrl,
    status: r.status,
    contactId: r.contactId,
    outreachStatus: r.outreachStatus ?? null,
  };
}

function normalizeSearch(raw: unknown): ProspectSearchHistory | null {
  if (!raw || typeof raw !== "object" || !("id" in raw)) return null;
  const s = raw as Record<string, unknown>;
  return {
    id: String(s.id),
    query: String(s.query ?? ""),
    segment: (s.segment as string | null) ?? null,
    state: (s.state as string | null) ?? null,
    city: (s.city as string | null) ?? null,
    location: (s.location as string | null) ?? null,
    engines: Array.isArray(s.engines) ? (s.engines as string[]) : ["maps"],
    totalCount: Number(s.totalCount ?? 0),
    qualifiedCount: Number(s.qualifiedCount ?? 0),
    status: (s.status as ProspectSearchHistory["status"]) ?? "DONE",
    webExhausted: s.webExhausted === true,
    errorMessage: (s.errorMessage as string | null) ?? null,
    createdAt:
      typeof s.createdAt === "string"
        ? s.createdAt
        : new Date().toISOString(),
    user: { name: null, email: null },
  };
}

type ViewTab = "capture" | "lists";

export function PesquisaClient({
  initialStats,
  initialSearches,
  initialPrimaryList = null,
  initialTab,
  showAgentsTab = false,
  title = "Pesquisa",
}: {
  initialStats?: ProspectStats;
  initialSearches: ProspectSearchHistory[];
  initialPrimaryList?: PrimaryProspectListDetail | null;
  initialTab?: ViewTab;
  showAgentsTab?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [viewTab, setViewTab] = useState<ViewTab>(initialTab ?? "capture");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searches, setSearches] = useState(initialSearches);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    setSearches(initialSearches);
  }, [initialSearches]);

  const primaryListQ = useQuery({
    queryKey: ["prospect-list-primary"],
    queryFn: () => getPrimaryProspectList(),
    initialData: initialPrimaryList ?? undefined,
    enabled: viewTab === "lists" || !!activeSearchId,
  });

  const searchMut = useMutation({
    mutationFn: (payload: CaptureFormPayload) => prospectingSearch(payload),
    onSuccess: (data) => {
      if (!data.ok) {
        setCaptureError(data.message);
        return;
      }
      setCaptureError(null);
      setActiveSearchId(data.searchId);
      setViewTab("capture");
      void primaryListQ.refetch();
      router.refresh();
    },
    onError: () => {
      setCaptureError("Falha na captura. Tente novamente.");
    },
  });

  const statusQ = useQuery({
    queryKey: ["prospect-search", activeSearchId],
    queryFn: () => prospectingGetSearch(activeSearchId!),
    enabled: !!activeSearchId,
    refetchInterval: (q) => {
      const s = normalizeSearch(q.state.data?.search);
      if (!s) return 3000;
      return s.status === "RUNNING" || s.status === "ENRICHING" ? 3000 : false;
    },
  });

  const activeSearch = useMemo(() => {
    const fromQuery = normalizeSearch(statusQ.data?.search);
    if (fromQuery) return fromQuery;
    if (!activeSearchId) return null;
    return searches.find((s) => s.id === activeSearchId) ?? null;
  }, [statusQ.data?.search, activeSearchId, searches]);

  useEffect(() => {
    const updated = normalizeSearch(statusQ.data?.search);
    if (!updated) return;
    setSearches((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
    );
    if (updated.status === "DONE") {
      void primaryListQ.refetch();
    }
  }, [statusQ.data?.search]);

  const results = (statusQ.data?.results ?? []) as ProspectRow[];
  const captureRows = useMemo(() => results.map(toCaptureRow), [results]);

  if (activeSearchId && activeSearch) {
    return (
      <ListaCaptureResults
        search={activeSearch}
        results={captureRows}
        loading={statusQ.isLoading}
        isRunning={
          activeSearch.status === "RUNNING" ||
          activeSearch.status === "ENRICHING"
        }
        savedToList={activeSearch.status === "DONE"}
        onBack={() => {
          setActiveSearchId(null);
        }}
        onDeleteSearch={async () => {
          if (!confirm("Excluir esta captura e todos os resultados?")) return;
          await prospectingDeleteSearch(activeSearchId);
          setActiveSearchId(null);
          void primaryListQ.refetch();
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Capture empresas no Google Maps. Cada captura alimenta automaticamente
            sua lista principal para abordagem no Disparo.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setHistoryOpen(true)}
        >
          <Clock className="size-4" />
          <span className="ml-2">Histórico</span>
        </Button>
      </div>

      {initialStats ? <ListaStatsCards stats={initialStats} /> : null}

      <ProspeccaoTabs
        active={viewTab}
        listItemCount={primaryListQ.data?.itemCount ?? 0}
        showAgentsTab={showAgentsTab}
        onSelectCapture={() => setViewTab("capture")}
        onSelectLists={() => setViewTab("lists")}
      />

      {viewTab === "lists" ? (
        <ListaPrincipalPanel
          list={primaryListQ.data ?? null}
          loading={primaryListQ.isLoading}
        />
      ) : (
        <ListaCaptureForm
          pending={searchMut.isPending}
          error={captureError}
          onSubmit={(payload) => {
            setCaptureError(null);
            searchMut.mutate(payload);
          }}
        />
      )}

      <ListaHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        searches={searches}
        onView={(id) => {
          setActiveSearchId(id);
          setHistoryOpen(false);
        }}
      />
    </div>
  );
}
