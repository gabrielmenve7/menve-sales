"use client";

import type { WhatsAppConnection } from "@prisma/client";
import { Copy, Loader2, Pencil, Plus, Radio, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createMetaChannel, createInstagramChannel } from "@/actions/channels";
import {
  fetchMetaEmbeddedSignupInfo,
  fetchMetaOnboardingInfo,
  patchMetaWhatsAppConnection,
  testMetaWhatsAppConnection,
  type MetaEmbeddedSignupInfo,
  type MetaOnboardingInfo,
} from "@/actions/whatsapp-meta";
import {
  deleteWhatsAppConnection,
  pollEvolutionStatus,
  reapplyEvolutionWebhook,
  refreshEvolutionQr,
  startEvolutionPairing,
} from "@/actions/whatsapp-connections";
import {
  createQuickReply,
  createQuickReplyCategory,
  deleteQuickReply,
  deleteQuickReplyCategory,
} from "@/actions/quick-replies";
import type { QuickReplyCategoryDTO } from "@/lib/quick-reply-types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppLogo } from "@/components/icons/whatsapp-logo";
import { cn } from "@/lib/utils";

type ChannelOption = "evolution" | "meta" | "instagram";

const PROVIDER_LABELS: Record<string, string> = {
  EVOLUTION: "WhatsApp (Evolution)",
  META: "WhatsApp Official",
  INSTAGRAM: "Instagram",
};

function providerIcon(provider: string) {
  if (provider === "EVOLUTION" || provider === "META") {
    return (
      <span className="flex size-8 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
        <WhatsAppLogo className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-600">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    </span>
  );
}

const QR_COUNTDOWN = 60;

export function SettingsChannels({
  connections,
  quickReplyCategories,
  webhookBaseUrl,
}: {
  connections: WhatsAppConnection[];
  quickReplyCategories: QuickReplyCategoryDTO[];
  webhookBaseUrl: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  // New channel dialog
  const [newOpen, setNewOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ChannelOption | null>(null);

  // Evolution pairing
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingConnId, setPairingConnId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_COUNTDOWN);
  const [refreshQrLoading, setRefreshQrLoading] = useState(false);
  const [reapplyWebhookId, setReapplyWebhookId] = useState<string | null>(null);

  // Meta wizard + edição
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaWizardStep, setMetaWizardStep] = useState(0);
  const [metaOnboarding, setMetaOnboarding] = useState<MetaOnboardingInfo | null>(null);
  const [metaEmbedded, setMetaEmbedded] = useState<MetaEmbeddedSignupInfo | null>(null);
  const [metaOnboardingError, setMetaOnboardingError] = useState<string | null>(null);
  const [metaCreatedConnectionId, setMetaCreatedConnectionId] = useState<string | null>(null);
  const [metaName, setMetaName] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState("");
  const [metaTestResult, setMetaTestResult] = useState<string | null>(null);
  const [testingMetaId, setTestingMetaId] = useState<string | null>(null);
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [metaEditConn, setMetaEditConn] = useState<WhatsAppConnection | null>(null);
  const [metaEditName, setMetaEditName] = useState("");
  const [metaEditPhone, setMetaEditPhone] = useState("");
  const [metaEditToken, setMetaEditToken] = useState("");
  const [metaEditWaba, setMetaEditWaba] = useState("");

  // Instagram form
  const [igOpen, setIgOpen] = useState(false);
  const [igName, setIgName] = useState("");
  const [igPageId, setIgPageId] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igUserId, setIgUserId] = useState("");

  // Respostas rápidas (categorias + scripts)
  const [newCategoryName, setNewCategoryName] = useState("");
  const [scriptTitles, setScriptTitles] = useState<Record<string, string>>({});
  const [scriptBodies, setScriptBodies] = useState<Record<string, string>>({});

  function selectChannelType(type: ChannelOption) {
    setNewOpen(false);
    setSelectedType(type);
    if (type === "evolution") {
      void startEvolutionFlow();
    } else if (type === "meta") {
      setMetaWizardStep(0);
      setMetaCreatedConnectionId(null);
      setMetaTestResult(null);
      setMetaOnboarding(null);
      setMetaEmbedded(null);
      setMetaOnboardingError(null);
      setMetaOpen(true);
    } else if (type === "instagram") {
      setIgOpen(true);
    }
  }

  async function startEvolutionFlow() {
    setLoading(true);
    setPairingError(null);
    try {
      const r = await startEvolutionPairing();
      if (!r.qrDataUrl?.trim()) {
        throw new Error("A API não retornou o QR Code. Verifique Evolution e PUBLIC_APP_URL.");
      }
      setPairingConnId(r.connectionId);
      setQrDataUrl(r.qrDataUrl);
      setPairingOpen(true);
      setSecondsLeft(QR_COUNTDOWN);
      startPairingPoll(r.connectionId);
      startCountdown();
      // Não chamar router.refresh() aqui: em produção o refetch do Server Component
      // (/settings) pode falhar ou competir com o estado do modal e gerar digest + "Sem QR".
      // A lista é atualizada ao fechar o modal ou quando o pareamento conectar.
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg =
        raw.includes("Server Components render") || raw.includes("digest")
          ? "Conflito ao atualizar a página em segundo plano. Faça deploy com a última correção (sem revalidar /settings no pareamento) e confira no serviço do Next: INTERNAL_API_URL e INTERNAL_API_KEY apontando para a API Railway."
          : raw;
      setPairingError(msg);
      setPairingOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function startCountdown() {
    setSecondsLeft(QR_COUNTDOWN);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    if (!metaOpen) return;
    let cancelled = false;
    setMetaOnboardingError(null);
    void (async () => {
      try {
        const [info, emb] = await Promise.all([
          fetchMetaOnboardingInfo(),
          fetchMetaEmbeddedSignupInfo(),
        ]);
        if (!cancelled) {
          setMetaOnboarding(info);
          setMetaEmbedded(emb);
        }
      } catch (e) {
        if (!cancelled) {
          setMetaOnboardingError(
            e instanceof Error ? e.message : "Falha ao carregar dados do webhook",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metaOpen]);

  async function copyToClipboard(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copiado.`);
    } catch {
      alert("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  function openMetaEdit(c: WhatsAppConnection) {
    const cfg = c.config as Record<string, string>;
    setMetaEditConn(c);
    setMetaEditName(c.name);
    setMetaEditPhone(cfg.phoneNumberId ?? "");
    setMetaEditToken("");
    setMetaEditWaba(cfg.businessAccountId ?? "");
    setMetaEditOpen(true);
  }

  async function onPatchMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!metaEditConn) return;
    setLoading(true);
    try {
      await patchMetaWhatsAppConnection({
        connectionId: metaEditConn.id,
        name: metaEditName.trim(),
        phoneNumberId: metaEditPhone.trim(),
        businessAccountId: metaEditWaba.trim(),
        ...(metaEditToken.trim() ? { accessToken: metaEditToken.trim() } : {}),
      });
      setMetaEditOpen(false);
      setMetaEditConn(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function runMetaTest(
    connectionId: string,
    opts?: { inWizard?: boolean },
  ) {
    setTestingMetaId(connectionId);
    if (opts?.inWizard) setMetaTestResult(null);
    try {
      const r = await testMetaWhatsAppConnection(connectionId);
      const msg = r.connected
        ? "Conexão OK — Graph API respondeu para este número."
        : `Falha: ${r.detail ?? "sem detalhe"}`;
      if (opts?.inWizard) setMetaTestResult(msg);
      else alert(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao testar";
      if (opts?.inWizard) setMetaTestResult(msg);
      else alert(msg);
    } finally {
      setTestingMetaId(null);
    }
  }

  function startPairingPoll(connId: string) {
    const id = setInterval(async () => {
      try {
        const r = await pollEvolutionStatus(connId);
        if (r.ok && "connected" in r && r.connected) {
          clearInterval(id);
          setPairingOpen(false);
          setPairingConnId(null);
          setQrDataUrl(null);
          setTimeout(() => {
            startTransition(() => router.refresh());
          }, 0);
        }
      } catch { /* ignore */ }
    }, 3000);
    setTimeout(() => clearInterval(id), 120_000);
  }

  async function onRefreshQr() {
    if (!pairingConnId) return;
    setRefreshQrLoading(true);
    setPairingError(null);
    try {
      const r = await refreshEvolutionQr(pairingConnId);
      setQrDataUrl(r.qrDataUrl);
      setSecondsLeft(QR_COUNTDOWN);
    } catch (e) {
      setPairingError(e instanceof Error ? e.message : "Falha ao recarregar QR");
    } finally {
      setRefreshQrLoading(false);
    }
  }

  async function onCreateMeta(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await createMetaChannel({
        name: metaName.trim() || "WhatsApp Official",
        phoneNumberId: metaPhoneNumberId.trim(),
        accessToken: metaAccessToken.trim(),
        businessAccountId: metaBusinessAccountId.trim(),
      });
      setMetaCreatedConnectionId(r.connectionId);
      setMetaWizardStep(3);
      setMetaTestResult(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao conectar");
    } finally {
      setLoading(false);
    }
  }

  function closeMetaWizard() {
    setMetaOpen(false);
    setMetaWizardStep(0);
    setMetaName("");
    setMetaPhoneNumberId("");
    setMetaAccessToken("");
    setMetaBusinessAccountId("");
    setMetaCreatedConnectionId(null);
    setMetaTestResult(null);
  }

  async function onCreateInstagram(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createInstagramChannel({
        name: igName.trim() || "Instagram",
        pageId: igPageId.trim(),
        accessToken: igAccessToken.trim(),
        igUserId: igUserId.trim(),
      });
      setIgOpen(false);
      setIgName("");
      setIgPageId("");
      setIgAccessToken("");
      setIgUserId("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onReapplyEvolutionWebhook(connectionId: string) {
    setReapplyWebhookId(connectionId);
    try {
      await reapplyEvolutionWebhook(connectionId);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao reaplicar webhook");
    } finally {
      setReapplyWebhookId(null);
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remover este canal? As conversas vinculadas serão apagadas.")) return;
    setLoading(true);
    try {
      await deleteWhatsAppConnection(id);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setLoading(true);
    try {
      await createQuickReplyCategory(newCategoryName.trim());
      setNewCategoryName("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onCreateScript(e: React.FormEvent, categoryId: string) {
    e.preventDefault();
    const title = (scriptTitles[categoryId] ?? "").trim();
    const body = (scriptBodies[categoryId] ?? "").trim();
    if (!title || !body) return;
    setLoading(true);
    try {
      await createQuickReply({ categoryId, title, body });
      setScriptTitles((m) => ({ ...m, [categoryId]: "" }));
      setScriptBodies((m) => ({ ...m, [categoryId]: "" }));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Connected channels list */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Canais Conectados</CardTitle>
            <CardDescription>Gerencie seus canais de atendimento</CardDescription>
          </div>
          <Button onClick={() => setNewOpen(true)} disabled={loading}>
            <Plus className="mr-1.5 size-4" /> Novo Canal
          </Button>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
              <Radio className="size-10 text-muted-foreground/50" strokeWidth={1.5} />
              <div>
                <p className="font-medium">Nenhum canal configurado</p>
                <p className="text-sm text-muted-foreground">
                  Conecte seu primeiro canal para começar a receber mensagens
                </p>
              </div>
              <Button variant="default" onClick={() => setNewOpen(true)}>
                <Plus className="mr-1.5 size-4" /> Conectar Canal
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {connections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border p-4"
                >
                  {providerIcon(c.provider)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {PROVIDER_LABELS[c.provider] ?? c.provider}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      c.isActive
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.isActive ? "Conectado" : "Desconectado"}
                  </span>
                  {c.provider === "META" && (
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        disabled={loading}
                        onClick={() => openMetaEdit(c)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        disabled={loading || testingMetaId === c.id}
                        onClick={() => void runMetaTest(c.id)}
                      >
                        {testingMetaId === c.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Testar"
                        )}
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    disabled={loading}
                    onClick={() => void onRemove(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Webhook URLs */}
      {connections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>URLs de webhook por canal conectado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {connections.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="font-medium">{c.name} — {PROVIDER_LABELS[c.provider] ?? c.provider}</p>
                {c.provider === "EVOLUTION" ? (
                  <div className="mt-2 space-y-2">
                    <p className="break-all text-xs text-muted-foreground">
                      POST{" "}
                      <code>
                        {webhookBaseUrl}/webhooks/whatsapp/evolution/{c.id}
                      </code>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={reapplyWebhookId === c.id}
                      onClick={() => void onReapplyEvolutionWebhook(c.id)}
                    >
                      {reapplyWebhookId === c.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Reaplicar webhook na Evolution
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Use após mudar a URL pública da API (ex.: túnel ngrok) em{" "}
                      <code className="rounded bg-muted px-1">PUBLIC_APP_URL</code>.
                    </p>
                  </div>
                ) : c.provider === "META" ? (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Callback: <code>{webhookBaseUrl}/webhooks/whatsapp/meta</code> + verify token
                  </p>
                ) : (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Callback: <code>{webhookBaseUrl}/webhooks/instagram/{c.id}</code>
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Respostas rápidas por categoria (etapa) */}
      <Card>
        <CardHeader>
          <CardTitle>Respostas rápidas</CardTitle>
          <CardDescription>
            Crie categorias (ex.: Qualificação, Proposta) e, em cada uma, scripts com título e
            texto. No Inbox, cada categoria abre um submenu com os títulos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={onCreateCategory} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="qr-cat-name">Nova categoria (etapa)</Label>
              <Input
                id="qr-cat-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex.: Qualificação"
              />
            </div>
            <Button type="submit" disabled={loading || !newCategoryName.trim()}>
              {loading ? "Salvando…" : "Criar categoria"}
            </Button>
          </form>

          {quickReplyCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria ainda. Crie a primeira para começar a cadastrar scripts.
            </p>
          ) : (
            <ul className="space-y-4">
              {quickReplyCategories.map((cat) => (
                <li
                  key={cat.id}
                  className="rounded-xl border border-border/60 bg-muted/20 p-4 dark:bg-muted/10"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{cat.name}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={loading}
                      onClick={async () => {
                        if (
                          !confirm(
                            `Excluir a categoria "${cat.name}" e todos os ${cat.replies.length} script(s) dentro dela?`,
                          )
                        ) {
                          return;
                        }
                        setLoading(true);
                        try {
                          await deleteQuickReplyCategory(cat.id);
                          router.refresh();
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Excluir categoria
                    </Button>
                  </div>

                  {cat.replies.length > 0 ? (
                    <ul className="mb-4 space-y-2">
                      {cat.replies.map((q) => (
                        <li
                          key={q.id}
                          className="flex items-start justify-between gap-2 rounded-lg border bg-background/80 p-3 text-sm dark:bg-background/40"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{q.title}</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground line-clamp-3">
                              {q.body}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-destructive"
                            disabled={loading}
                            onClick={async () => {
                              if (!confirm("Remover este script?")) return;
                              setLoading(true);
                              try {
                                await deleteQuickReply(q.id);
                                router.refresh();
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            Excluir
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-muted-foreground">
                      Nenhum script nesta categoria ainda.
                    </p>
                  )}

                  <form
                    onSubmit={(e) => void onCreateScript(e, cat.id)}
                    className="space-y-2 border-t border-border/40 pt-3"
                  >
                    <p className="text-xs font-medium text-muted-foreground">Novo script</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`qr-title-${cat.id}`}>Título (no menu)</Label>
                        <Input
                          id={`qr-title-${cat.id}`}
                          value={scriptTitles[cat.id] ?? ""}
                          onChange={(e) =>
                            setScriptTitles((m) => ({ ...m, [cat.id]: e.target.value }))
                          }
                          placeholder="Ex.: Cadência 01"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`qr-body-${cat.id}`}>Mensagem</Label>
                      <textarea
                        id={`qr-body-${cat.id}`}
                        value={scriptBodies[cat.id] ?? ""}
                        onChange={(e) =>
                          setScriptBodies((m) => ({ ...m, [cat.id]: e.target.value }))
                        }
                        className="min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                        placeholder="Texto inserido no campo ao escolher o script…"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        loading ||
                        !(scriptTitles[cat.id] ?? "").trim() ||
                        !(scriptBodies[cat.id] ?? "").trim()
                      }
                    >
                      Adicionar script
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* New Channel picker dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Canal</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              onClick={() => selectChannelType("evolution")}
            >
              {providerIcon("EVOLUTION")}
              <div>
                <p className="text-sm font-medium">WhatsApp (Evolution)</p>
                <p className="text-xs text-muted-foreground">
                  Conecte via Evolution API — sem restrição de 24h
                </p>
              </div>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              onClick={() => selectChannelType("meta")}
            >
              {providerIcon("META")}
              <div>
                <p className="text-sm font-medium">WhatsApp Official</p>
                <p className="text-xs text-muted-foreground">
                  Meta Cloud API — templates HSM, alta escala
                </p>
              </div>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              onClick={() => selectChannelType("instagram")}
            >
              {providerIcon("INSTAGRAM")}
              <div>
                <p className="text-sm font-medium">Instagram</p>
                <p className="text-xs text-muted-foreground">
                  Instagram Messenger API — DMs e stories
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Evolution QR pairing dialog */}
      <Dialog
        open={pairingOpen}
        onOpenChange={(o) => {
          setPairingOpen(o);
          if (!o) {
            setPairingConnId(null);
            setQrDataUrl(null);
            setPairingError(null);
            setTimeout(() => {
              startTransition(() => router.refresh());
            }, 0);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar um aparelho.
              Escaneie o código abaixo.
            </DialogDescription>
          </DialogHeader>
          {pairingError && <p className="text-sm text-destructive">{pairingError}</p>}
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR Code" className="h-56 w-56 rounded-md border bg-white p-2" />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">Sem QR</div>
            )}
            <p className="text-sm text-muted-foreground">
              Tempo estimado: <span className="font-medium tabular-nums text-foreground">{secondsLeft}s</span>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" disabled={refreshQrLoading || !pairingConnId} onClick={() => void onRefreshQr()}>
              {refreshQrLoading ? <><Loader2 className="mr-2 size-4 animate-spin" />Gerando…</> : "Recarregar QR"}
            </Button>
            <Button variant="secondary" onClick={() => setPairingOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meta Cloud API — assistente de ativação */}
      <Dialog
        open={metaOpen}
        onOpenChange={(o) => {
          if (!o) closeMetaWizard();
          else setMetaOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>WhatsApp Official — Meta Cloud API</DialogTitle>
            <DialogDescription>
              {metaWizardStep === 0 &&
                "Ative o canal no Meta for Developers e conclua aqui. Todas as etapas podem ser feitas com o assistente abaixo."}
              {metaWizardStep === 1 &&
                "Configure o webhook no app Meta com a URL e o verify token exibidos aqui."}
              {metaWizardStep === 2 &&
                "Credenciais da API Setup (Phone Number ID, token temporário ou de sistema)."}
              {metaWizardStep === 3 && "Canal registrado no Menve. Valide a conexão com a Graph API."}
            </DialogDescription>
          </DialogHeader>

          {metaOnboardingError && (
            <p className="text-sm text-destructive">{metaOnboardingError}</p>
          )}

          {metaWizardStep === 0 && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Você precisa de:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Conta Meta Business e acesso ao app em developers.facebook.com</li>
                <li>Número aprovado para WhatsApp Business (Cloud API)</li>
                <li>
                  URL pública HTTPS da API Menve em{" "}
                  <code className="rounded bg-muted px-1">PUBLIC_APP_URL</code>{" "}
                  (mesma base usada no webhook)
                </li>
              </ul>
              <p className="text-xs">
                Fora da janela de 24h com o cliente, use{" "}
                <strong>templates</strong> aprovados — envio pelo Inbox (Meta) ou
                campanhas futuras.
              </p>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={closeMetaWizard}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => setMetaWizardStep(1)}>
                  Próximo: Webhook
                </Button>
              </DialogFooter>
            </div>
          )}

          {metaWizardStep === 1 && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Callback URL (cole em WhatsApp → Configuration → Webhook)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="max-w-full flex-1 break-all text-xs">
                    {metaOnboarding?.callbackUrl ||
                      (webhookBaseUrl
                        ? `${webhookBaseUrl}/webhooks/whatsapp/meta`
                        : "(configure PUBLIC_APP_URL)")}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 gap-1"
                    disabled={!(metaOnboarding?.callbackUrl || webhookBaseUrl)}
                    onClick={() =>
                      void copyToClipboard(
                        "Callback URL",
                        metaOnboarding?.callbackUrl ||
                          `${webhookBaseUrl}/webhooks/whatsapp/meta`,
                      )
                    }
                  >
                    <Copy className="size-3.5" />
                    Copiar
                  </Button>
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Verify token (o mesmo valor em{" "}
                  <code className="rounded bg-background px-1">META_VERIFY_TOKEN</code> na API)
                </p>
                {metaOnboarding?.verifyTokenConfigured ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="max-w-full flex-1 break-all text-xs">
                      {metaOnboarding.verifyToken}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0 gap-1"
                      onClick={() =>
                        void copyToClipboard("Verify token", metaOnboarding.verifyToken)
                      }
                    >
                      <Copy className="size-3.5" />
                      Copiar
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Defina META_VERIFY_TOKEN no servidor da API e reinicie o serviço.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">Assine o campo</p>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {(metaOnboarding?.subscribedFieldsSuggestion ?? ["messages"]).map((f) => (
                    <li key={f}>
                      <code>{f}</code>
                    </li>
                  ))}
                </ul>
              </div>
              {metaOnboarding && !metaOnboarding.metaAppSecretConfigured && (
                <p className="text-xs text-muted-foreground">
                  Recomendado em produção: defina{" "}
                  <code className="rounded bg-muted px-1">META_APP_SECRET</code>{" "}
                  para validar assinatura{" "}
                  <code className="rounded bg-muted px-1">X-Hub-Signature-256</code>.
                </p>
              )}
              {metaEmbedded?.enabled && (
                <div className="rounded-md border border-dashed p-3 text-xs">
                  <p className="mb-2 font-medium text-foreground">
                    Embedded Signup (OAuth) habilitado no servidor
                  </p>
                  <a
                    href={metaEmbedded.oauthAuthorizationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-solid underline"
                  >
                    Abrir login Meta para conectar WABA
                  </a>
                  <p className="mt-2 text-muted-foreground">
                    Após concluir no Meta, ainda informe Phone Number ID e token aqui
                    se o callback OAuth ainda não estiver ligado ao Menve.
                  </p>
                </div>
              )}
              {metaEmbedded && !metaEmbedded.enabled && (
                <p className="text-[11px] text-muted-foreground">
                  {metaEmbedded.message}
                </p>
              )}
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setMetaWizardStep(0)}>
                  Voltar
                </Button>
                <Button type="button" onClick={() => setMetaWizardStep(2)}>
                  Próximo: Credenciais
                </Button>
              </DialogFooter>
            </div>
          )}

          {metaWizardStep === 2 && (
            <form onSubmit={onCreateMeta} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="meta-name">Nome da conexão</Label>
                <Input
                  id="meta-name"
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  placeholder="WhatsApp Business"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meta-phone">Phone Number ID</Label>
                <Input
                  id="meta-phone"
                  value={metaPhoneNumberId}
                  onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meta-token">Access Token</Label>
                <Input
                  id="meta-token"
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meta-ba">WhatsApp Business Account ID (WABA)</Label>
                <Input
                  id="meta-ba"
                  value={metaBusinessAccountId}
                  onChange={(e) => setMetaBusinessAccountId(e.target.value)}
                  placeholder="Opcional para receber mensagens; obrigatório para listar templates"
                />
                <p className="text-[11px] text-muted-foreground">
                  Necessário para enviar templates pelo Inbox.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setMetaWizardStep(1)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Validando…
                    </>
                  ) : (
                    "Conectar"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {metaWizardStep === 3 && metaCreatedConnectionId && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Conexão salva. Use &quot;Testar&quot; para confirmar token e Phone Number ID
                com a Graph API.
              </p>
              {metaTestResult && (
                <p
                  className={
                    metaTestResult.startsWith("Conexão OK")
                      ? "text-green-700 dark:text-green-400"
                      : "text-destructive"
                  }
                >
                  {metaTestResult}
                </p>
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testingMetaId === metaCreatedConnectionId}
                  onClick={() =>
                    void runMetaTest(metaCreatedConnectionId, { inWizard: true })
                  }
                >
                  {testingMetaId === metaCreatedConnectionId ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Testar conexão
                </Button>
                <Button type="button" onClick={closeMetaWizard}>
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar conexão Meta */}
      <Dialog open={metaEditOpen} onOpenChange={setMetaEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar WhatsApp Official</DialogTitle>
            <DialogDescription>
              Atualize credenciais sem remover conversas. Deixe o token em branco para manter o atual.
            </DialogDescription>
          </DialogHeader>
          {metaEditConn && (
            <form onSubmit={onPatchMeta} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="meta-edit-name">Nome</Label>
                <Input
                  id="meta-edit-name"
                  value={metaEditName}
                  onChange={(e) => setMetaEditName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meta-edit-phone">Phone Number ID</Label>
                <Input
                  id="meta-edit-phone"
                  value={metaEditPhone}
                  onChange={(e) => setMetaEditPhone(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meta-edit-token">Access Token (novo)</Label>
                <Input
                  id="meta-edit-token"
                  type="password"
                  value={metaEditToken}
                  onChange={(e) => setMetaEditToken(e.target.value)}
                  placeholder="Deixe vazio para não alterar"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meta-edit-waba">WABA ID</Label>
                <Input
                  id="meta-edit-waba"
                  value={metaEditWaba}
                  onChange={(e) => setMetaEditWaba(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMetaEditOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Instagram form dialog */}
      <Dialog open={igOpen} onOpenChange={setIgOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instagram Messenger API</DialogTitle>
            <DialogDescription>
              Insira as credenciais da Graph API do Meta para receber DMs do Instagram.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateInstagram} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="ig-name">Nome da conexão</Label>
              <Input id="ig-name" value={igName} onChange={(e) => setIgName(e.target.value)} placeholder="Instagram Business" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ig-page">Page ID</Label>
              <Input id="ig-page" value={igPageId} onChange={(e) => setIgPageId(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ig-token">Access Token</Label>
              <Input id="ig-token" type="password" value={igAccessToken} onChange={(e) => setIgAccessToken(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ig-user">Instagram User ID</Label>
              <Input id="ig-user" value={igUserId} onChange={(e) => setIgUserId(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIgOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Salvando…</> : "Conectar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
