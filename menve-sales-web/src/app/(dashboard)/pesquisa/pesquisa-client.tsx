"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Clock, List, Bot } from "lucide-react";
import type { OutreachStatus } from "@/actions/prospect-lists";
import type { LarissaConfigResponse } from "@/actions/agents";
import { AgentesPanel } from "@/components/agentes/agentes-panel";

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

type ViewTab = "capture" | "lists" | "agents";

export function PesquisaClient({
  initialStats,
  initialSearches,
  initialPrimaryList = null,
  initialLarissaConfig = null,
  initialTab,
  showAgentsTab = false,
  agentsPath = "/lista/agentes",
  listaPath = "/lista",
  title = "Pesquisa",
}: {
  initialStats?: ProspectStats;
  initialSearches: ProspectSearchHistory[];
  initialPrimaryList?: PrimaryProspectListDetail | null;
  initialLarissaConfig?: LarissaConfigResponse | null;
  initialTab?: ViewTab;
  showAgentsTab?: boolean;
  agentsPath?: string;
  listaPath?: string;
  title?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewTab, setViewTab] = useState<ViewTab>(
    initialTab ?? (searchParams.get("tab") === "agentes" ? "agents" : "capture"),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searches, setSearches] = useState(initialSearches);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  function selectTab(tab: ViewTab) {
    setViewTab(tab);
    if (tab === "agents") {
      router.replace(agentsPath, { scroll: false });
    } else {
      router.replace(listaPath, { scroll: false });
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname.replace(/\/$/, "");
      const agents = agentsPath.replace(/\/$/, "");
      if (path === agents || path.endsWith("/agentes")) {
        if (showAgentsTab) setViewTab("agents");
        return;
      }
    }
    const t = searchParams.get("tab");
    if (t === "agentes" && showAgentsTab) {
      setViewTab("agents");
    }
  }, [searchParams, showAgentsTab, agentsPath]);

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

      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-2">
        <Button
          type="button"
          size="sm"
          variant={viewTab === "capture" ? "secondary" : "ghost"}
          onClick={() => selectTab("capture")}
        >
          Capturar
        </Button>
        <Button
          type="button"
          size="sm"
          variant={viewTab === "lists" ? "secondary" : "ghost"}
          onClick={() => selectTab("lists")}
        >
          <List className="size-4" />
          <span className="ml-2">
            Minha lista ({primaryListQ.data?.itemCount ?? 0})
          </span>
        </Button>
        {showAgentsTab ? (
          <Button
            type="button"
            size="sm"
            variant={viewTab === "agents" ? "secondary" : "ghost"}
            onClick={() => selectTab("agents")}
          >
            <Bot className="size-4" />
            <span className="ml-2">Agentes IA</span>
          </Button>
        ) : null}
      </div>

      {viewTab === "agents" && initialLarissaConfig ? (
        <AgentesPanel initial={initialLarissaConfig} embedded />
      ) : viewTab === "lists" ? (
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
