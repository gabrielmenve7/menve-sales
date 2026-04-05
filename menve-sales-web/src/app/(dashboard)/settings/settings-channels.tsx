"use client";

import type { QuickReply, WhatsAppConnection } from "@prisma/client";
import { Loader2, Plus, Radio, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createMetaChannel, createInstagramChannel } from "@/actions/channels";
import {
  deleteWhatsAppConnection,
  pollEvolutionStatus,
  refreshEvolutionQr,
  startEvolutionPairing,
} from "@/actions/whatsapp-connections";
import { createQuickReply, deleteQuickReply } from "@/actions/quick-replies";
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
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.216l-.257-.154-2.879.856.856-2.879-.154-.257A8 8 0 1112 20z" />
        </svg>
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
  quickReplies,
  webhookBaseUrl,
}: {
  connections: WhatsAppConnection[];
  quickReplies: QuickReply[];
  webhookBaseUrl: string;
}) {
  const router = useRouter();
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

  // Meta form
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState("");

  // Instagram form
  const [igOpen, setIgOpen] = useState(false);
  const [igName, setIgName] = useState("");
  const [igPageId, setIgPageId] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igUserId, setIgUserId] = useState("");

  // Quick replies
  const [qrTitle, setQrTitle] = useState("");
  const [qrBody, setQrBody] = useState("");

  function selectChannelType(type: ChannelOption) {
    setNewOpen(false);
    setSelectedType(type);
    if (type === "evolution") {
      void startEvolutionFlow();
    } else if (type === "meta") {
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
      setPairingConnId(r.connectionId);
      setQrDataUrl(r.qrDataUrl);
      setPairingOpen(true);
      setSecondsLeft(QR_COUNTDOWN);
      startPairingPoll(r.connectionId);
      startCountdown();
      router.refresh();
    } catch (e) {
      setPairingError(e instanceof Error ? e.message : "Falha ao iniciar pareamento");
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

  function startPairingPoll(connId: string) {
    const id = setInterval(async () => {
      try {
        const r = await pollEvolutionStatus(connId);
        if (r.ok && "connected" in r && r.connected) {
          clearInterval(id);
          setPairingOpen(false);
          setPairingConnId(null);
          setQrDataUrl(null);
          router.refresh();
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
      await createMetaChannel({
        name: metaName.trim() || "WhatsApp Official",
        phoneNumberId: metaPhoneNumberId.trim(),
        accessToken: metaAccessToken.trim(),
        businessAccountId: metaBusinessAccountId.trim(),
      });
      setMetaOpen(false);
      setMetaName("");
      setMetaPhoneNumberId("");
      setMetaAccessToken("");
      setMetaBusinessAccountId("");
      router.refresh();
    } finally {
      setLoading(false);
    }
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

  async function onCreateQr(e: React.FormEvent) {
    e.preventDefault();
    if (!qrTitle.trim() || !qrBody.trim()) return;
    setLoading(true);
    try {
      await createQuickReply({ title: qrTitle.trim(), body: qrBody.trim() });
      setQrTitle("");
      setQrBody("");
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
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    POST <code>{webhookBaseUrl}/webhooks/whatsapp/evolution/{c.id}</code>
                  </p>
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

      {/* Quick Replies */}
      <Card>
        <CardHeader>
          <CardTitle>Respostas rápidas</CardTitle>
          <CardDescription>Atalhos para preencher mensagens comuns no Inbox</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={onCreateQr} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="qr-title">Título do botão</Label>
                <Input
                  id="qr-title"
                  value={qrTitle}
                  onChange={(e) => setQrTitle(e.target.value)}
                  placeholder="Ex: Saudação"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="qr-body">Texto da mensagem</Label>
              <textarea
                id="qr-body"
                value={qrBody}
                onChange={(e) => setQrBody(e.target.value)}
                className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Texto enviado ao clicar no atalho…"
              />
            </div>
            <Button type="submit" disabled={loading || !qrTitle.trim() || !qrBody.trim()}>
              {loading ? "Salvando…" : "Adicionar"}
            </Button>
          </form>
          {quickReplies.length > 0 && (
            <ul className="space-y-2">
              {quickReplies.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{q.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{q.body}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    onClick={async () => {
                      if (!confirm("Remover esta resposta rápida?")) return;
                      setLoading(true);
                      try { await deleteQuickReply(q.id); router.refresh(); } finally { setLoading(false); }
                    }}
                  >
                    Excluir
                  </Button>
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
      <Dialog open={pairingOpen} onOpenChange={(o) => { setPairingOpen(o); if (!o) { setPairingConnId(null); setQrDataUrl(null); setPairingError(null); } }}>
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

      {/* Meta Cloud API form dialog */}
      <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>WhatsApp Official — Meta Cloud API</DialogTitle>
            <DialogDescription>
              Insira as credenciais do Meta Business. Encontre esses dados no Meta for Developers → WhatsApp → API Setup.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateMeta} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="meta-name">Nome da conexão</Label>
              <Input id="meta-name" value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="WhatsApp Business" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-phone">Phone Number ID</Label>
              <Input id="meta-phone" value={metaPhoneNumberId} onChange={(e) => setMetaPhoneNumberId(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-token">Access Token</Label>
              <Input id="meta-token" type="password" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-ba">Business Account ID</Label>
              <Input id="meta-ba" value={metaBusinessAccountId} onChange={(e) => setMetaBusinessAccountId(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMetaOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Salvando…</> : "Conectar"}
              </Button>
            </DialogFooter>
          </form>
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
