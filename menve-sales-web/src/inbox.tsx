"use client";

import type {
  Contact,
  Conversation,
  InternalNote,
  Message,
  QuickReply,
  User,
  WhatsAppConnection,
} from "@prisma/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addConversationNote } from "@/actions/conversation-notes";
import { sendWhatsAppMessage } from "@/actions/messages";
import {
  deleteWhatsAppConnection,
  pollEvolutionStatus,
  reapplyEvolutionWebhook,
  refreshEvolutionQr,
  startEvolutionPairing,
} from "@/actions/whatsapp-connections";
import { Button } from "@/components/ui/button";
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

type NoteRow = InternalNote & {
  user: Pick<User, "name" | "email">;
};

export type InboxConversation = Conversation & {
  contact: Contact;
  whatsappConnection: WhatsAppConnection;
  messages: Message[];
  internalNotes: NoteRow[];
};

function getContactPhotoUrl(contact: Contact): string | null {
  const cd =
    contact.customData && typeof contact.customData === "object"
      ? (contact.customData as Record<string, unknown>)
      : null;
  const raw = cd?.whatsappProfilePhotoUrl;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

async function fetchInbox() {
  const res = await fetch("/api/inbox");
  if (!res.ok) throw new Error("fetch");
  return res.json() as Promise<{ conversations: InboxConversation[] }>;
}

const QR_COUNTDOWN_SECONDS = 60;

export function InboxClient({
  connections,
  quickReplies,
  initialConversations,
  canManageConnections,
}: {
  connections: WhatsAppConnection[];
  quickReplies: QuickReply[];
  initialConversations: InboxConversation[];
  canManageConnections: boolean;
}) {
  const router = useRouter();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    () => connections.find((c) => c.isActive)?.id ?? connections[0]?.id ?? null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [text, setText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingConnectionId, setPairingConnectionId] = useState<string | null>(
    null,
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_COUNTDOWN_SECONDS);
  const [refreshQrLoading, setRefreshQrLoading] = useState(false);
  const [reapplyLoading, setReapplyLoading] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInbox,
    initialData: { conversations: initialConversations },
    refetchInterval: 5000,
  });

  const conversations = data?.conversations ?? initialConversations;

  useEffect(() => {
    if (connections.length === 0) {
      setSelectedConnectionId(null);
      return;
    }
    if (
      !selectedConnectionId ||
      !connections.some((c) => c.id === selectedConnectionId)
    ) {
      setSelectedConnectionId(
        connections.find((c) => c.isActive)?.id ?? connections[0]!.id,
      );
    }
  }, [connections, selectedConnectionId]);

  const filteredConversations = useMemo(() => {
    if (!selectedConnectionId) return conversations;
    return conversations.filter(
      (c) => c.whatsappConnectionId === selectedConnectionId,
    );
  }, [conversations, selectedConnectionId]);

  useEffect(() => {
    if (!filteredConversations.some((c) => c.id === selectedId)) {
      setSelectedId(filteredConversations[0]?.id ?? null);
    }
  }, [filteredConversations, selectedId]);

  const selected = useMemo(
    () => filteredConversations.find((c) => c.id === selectedId) ?? null,
    [filteredConversations, selectedId],
  );

  const activeConn =
    connections.find((c) => c.id === selectedConnectionId) ?? null;

  useEffect(() => {
    if (!pairingOpen || !pairingConnectionId) return;
    setSecondsLeft(QR_COUNTDOWN_SECONDS);
    const t = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [pairingOpen, pairingConnectionId]);

  const pollPairing = useCallback(async () => {
    if (!pairingConnectionId) return;
    try {
      const r = await pollEvolutionStatus(pairingConnectionId);
      if (r.ok && r.connected) {
        setPairingOpen(false);
        setPairingConnectionId(null);
        setQrDataUrl(null);
        setPairingError(null);
        router.refresh();
        await refetch();
      }
    } catch {
      /* ignore transient errors */
    }
  }, [pairingConnectionId, router, refetch]);

  useEffect(() => {
    if (!pairingOpen || !pairingConnectionId) return;
    void pollPairing();
    const id = setInterval(() => void pollPairing(), 3000);
    return () => clearInterval(id);
  }, [pairingOpen, pairingConnectionId, pollPairing]);

  async function onNewNumber() {
    if (!canManageConnections) return;
    setPairingError(null);
    setPairingLoading(true);
    try {
      const r = await startEvolutionPairing();
      setPairingConnectionId(r.connectionId);
      setQrDataUrl(r.qrDataUrl);
      setPairingOpen(true);
      router.refresh();
    } catch (e) {
      setPairingError(
        e instanceof Error ? e.message : "Não foi possível iniciar o pareamento.",
      );
    } finally {
      setPairingLoading(false);
    }
  }

  async function onRefreshQr() {
    if (!pairingConnectionId) return;
    setRefreshQrLoading(true);
    setPairingError(null);
    try {
      const r = await refreshEvolutionQr(pairingConnectionId);
      setQrDataUrl(r.qrDataUrl);
      setSecondsLeft(QR_COUNTDOWN_SECONDS);
    } catch (e) {
      setPairingError(
        e instanceof Error ? e.message : "Falha ao recarregar o QR Code.",
      );
    } finally {
      setRefreshQrLoading(false);
    }
  }

  async function onReapplyWebhook() {
    if (!selectedConnectionId) return;
    const line = connections.find((c) => c.id === selectedConnectionId);
    if (line?.provider !== "EVOLUTION") return;
    setReapplyLoading(true);
    try {
      await reapplyEvolutionWebhook(selectedConnectionId);
      router.refresh();
      await refetch();
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Não foi possível reaplicar o webhook.",
      );
    } finally {
      setReapplyLoading(false);
    }
  }

  async function onRemoveConnection(connectionId: string) {
    if (!canManageConnections) return;
    if (
      !window.confirm(
        "Remover esta conexão? As conversas vinculadas serão apagadas.",
      )
    ) {
      return;
    }
    try {
      await deleteWhatsAppConnection(connectionId);
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(null);
      }
      router.refresh();
      await refetch();
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Não foi possível remover a conexão.",
      );
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !activeConn || !text.trim()) return;
    const phone = selected.contact.phone;
    if (!phone) return;
    await sendWhatsAppMessage({
      connectionId: activeConn.id,
      toPhone: phone,
      text: text.trim(),
    });
    setText("");
    await refetch();
  }

  async function onAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !noteText.trim()) return;
    setNoteLoading(true);
    try {
      await addConversationNote({
        conversationId: selected.id,
        body: noteText.trim(),
      });
      setNoteText("");
      await refetch();
    } finally {
      setNoteLoading(false);
    }
  }

  const selectedConnLabel = activeConn?.name ?? "Conexão";

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,260px)_1fr_minmax(0,240px)]">
        <div className="flex max-h-[40vh] flex-col overflow-hidden rounded-xl border bg-card lg:max-h-none">
          <div className="border-b p-3">
            <p className="text-sm font-medium">Conexões WhatsApp</p>
            <p className="truncate text-xs text-muted-foreground" title={selectedConnLabel}>
              Ativa: {selectedConnLabel}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {connections.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                Nenhuma conexão. Use &quot;Novo número&quot; para parear com a
                Evolution.
              </p>
            ) : (
              connections.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-start gap-2 border-b px-3 py-2",
                    selectedConnectionId === c.id && "bg-muted/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedConnectionId(c.id)}
                    className="min-w-0 flex-1 text-left text-sm"
                  >
                    <span className="block font-medium leading-tight">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.provider === "EVOLUTION" ? "Evolution" : "Meta"} ·{" "}
                      {c.isActive ? "Conectado" : "Não conectado"}
                    </span>
                  </button>
                  {canManageConnections ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      title="Remover conexão"
                      onClick={() => void onRemoveConnection(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="space-y-2 border-t p-3">
            {canManageConnections ? (
              <Button
                type="button"
                className="w-full"
                disabled={pairingLoading}
                onClick={() => void onNewNumber()}
              >
                {pairingLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparando…
                  </>
                ) : (
                  "Novo número"
                )}
              </Button>
            ) : null}
            {canManageConnections &&
            selectedConnectionId &&
            connections.find((c) => c.id === selectedConnectionId)?.provider ===
              "EVOLUTION" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                disabled={reapplyLoading}
                title="Corrige URL do webhook na Evolution se as mensagens não chegarem"
                onClick={() => void onReapplyWebhook()}
              >
                {reapplyLoading ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                Reaplicar webhook
              </Button>
            ) : null}
            <Link
              href="/settings"
              className="block text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Respostas rápidas (Configurações)
            </Link>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-3 text-sm font-medium">Conversas</div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {selectedConnectionId
                  ? "Nenhuma conversa nesta linha ainda."
                  : "Selecione uma conexão ou aguarde mensagens via webhook."}
              </p>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 border-b px-3 py-3 text-left text-sm hover:bg-muted/50",
                    selectedId === c.id && "bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {getContactPhotoUrl(c.contact) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getContactPhotoUrl(c.contact) ?? ""}
                        alt={c.contact.name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {initials(c.contact.name)}
                      </span>
                    )}
                    <span className="font-medium">{c.contact.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.lastMessageAt
                      ? new Date(c.lastMessageAt).toLocaleString("pt-BR")
                      : "—"}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border bg-card">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="flex items-center gap-3">
                  {getContactPhotoUrl(selected.contact) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getContactPhotoUrl(selected.contact) ?? ""}
                      alt={selected.contact.name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {initials(selected.contact.name)}
                    </span>
                  )}
                  <p className="font-semibold">{selected.contact.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selected.contact.phone ?? "Sem telefone"}
                </p>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.direction === "OUTBOUND"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              {quickReplies.length > 0 ? (
                <div className="border-t px-3 py-2">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Respostas rápidas
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {quickReplies.map((q) => (
                      <Button
                        key={q.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          setText((t) => (t ? `${t}\n${q.body}` : q.body))
                        }
                      >
                        {q.title}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <form onSubmit={onSend} className="flex gap-2 border-t p-3">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    activeConn?.isActive
                      ? "Digite uma mensagem…"
                      : "Conecte a linha WhatsApp para enviar"
                  }
                  disabled={!activeConn || !activeConn.isActive}
                />
                <Button
                  type="submit"
                  disabled={!activeConn?.isActive || !text.trim()}
                >
                  Enviar
                </Button>
              </form>
            </>
          )}
        </div>

        <div className="flex max-h-[50vh] flex-col overflow-hidden rounded-xl border bg-card lg:max-h-none">
          <div className="border-b p-3 text-sm font-medium">Notas internas</div>
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            Visível só para a equipe (não vai ao WhatsApp).
          </p>
          <div className="flex-1 overflow-y-auto p-3">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
            ) : selected.internalNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
            ) : (
              <ul className="space-y-3">
                {selected.internalNotes.map((n) => (
                  <li key={n.id} className="rounded-lg border bg-muted/40 p-2 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(n.user.name ?? n.user.email) ?? "—"} ·{" "}
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected ? (
            <form onSubmit={onAddNote} className="border-t p-3">
              <Label htmlFor="note" className="sr-only">
                Nova nota
              </Label>
              <textarea
                id="note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Registrar observação interna…"
                className="mb-2 min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={noteLoading || !noteText.trim()}
              >
                {noteLoading ? "Salvando…" : "Salvar nota"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <Dialog
        open={pairingOpen}
        onOpenChange={(open) => {
          setPairingOpen(open);
          if (!open) {
            setPairingConnectionId(null);
            setQrDataUrl(null);
            setPairingError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar
              um aparelho. Escaneie o código abaixo. A conexão ativa sozinha
              quando o pareamento concluir.
            </DialogDescription>
          </DialogHeader>
          {pairingError ? (
            <p className="text-sm text-destructive">{pairingError}</p>
          ) : null}
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR Code WhatsApp"
                className="h-56 w-56 rounded-md border bg-white p-2"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                Sem QR
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Recarregue o QR se expirar. Tempo estimado:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {secondsLeft}s
              </span>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={refreshQrLoading || !pairingConnectionId}
              onClick={() => void onRefreshQr()}
            >
              {refreshQrLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                "Recarregar QR"
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPairingOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
