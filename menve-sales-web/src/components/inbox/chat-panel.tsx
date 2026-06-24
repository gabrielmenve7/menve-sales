"use client";

import {
  ChevronDown,
  ChevronUp,
  FileText,
  LayoutTemplate,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useState, useCallback } from "react";
import { fetchOlderInboxMessages } from "@/actions/inbox-fetch";
import { addConversationNote } from "@/actions/conversation-notes";
import { listMetaTemplates } from "@/actions/whatsapp-meta";
import {
  formatInboxSendError,
  inboxApiDelete,
  inboxApiPost,
} from "@/lib/inbox-api-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { inboxQueryKeys } from "@/lib/inbox-query-keys";
import { cn } from "@/lib/utils";
import type { QuickReplyCategoryDTO } from "@/lib/quick-reply-types";
import { quickRepliesHaveScripts } from "@/lib/quick-reply-types";
import type { InboxConversation, InboxMessage } from "./inbox-types";
import { ContactPhotoAvatar } from "./contact-photo-avatar";
import { getContactPhotoUrl } from "./inbox-utils";
import { MessageBubble } from "./message-bubble";
import { QualificationBanner } from "./qualification-banner";

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Leitura do arquivo falhou"));
    r.readAsDataURL(file);
  });
}

/** Mesma chave que `InboxClient` (`inboxQueryKeys.list`). */
const INBOX_QUERY_KEY = inboxQueryKeys.list;

type InboxQueryData = { conversations: InboxConversation[] };

function resolveInboxSendContext(conversation: InboxConversation) {
  const phone = conversation.contact?.phone?.trim() ?? "";
  const connectionId =
    conversation.whatsappConnection?.id?.trim() ||
    conversation.whatsappConnectionId?.trim() ||
    "";
  const channelActive = conversation.whatsappConnection?.isActive ?? true;
  return { phone, connectionId, channelActive };
}

function buildOptimisticOutboundMessage(
  conversation: InboxConversation,
  body: string,
): InboxMessage {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `pending:${crypto.randomUUID()}`
      : `pending:${Date.now()}`;
  const isMeta = conversation.whatsappConnection?.provider === "META";
  return {
    id,
    tenantId: conversation.tenantId,
    whatsappConnectionId: conversation.whatsappConnectionId,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    userId: null,
    direction: "OUTBOUND",
    body,
    mediaUrl: null,
    mediaType: null,
    externalId: null,
    ackStatus: isMeta ? "DELIVERED" : "SENT",
    createdAt: new Date(),
  } as InboxMessage;
}

function attachmentKind(file: File): "image" | "document" | null {
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "document";
  }
  return null;
}

export function ChatPanel({
  conversation,
  quickReplyCategories,
  larissaEnabled = false,
  onRefetch,
  onDeleted,
}: {
  conversation: InboxConversation;
  quickReplyCategories: QuickReplyCategoryDTO[];
  larissaEnabled?: boolean;
  onRefetch: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Evita duplo envio no mesmo instante (Enter duplo) antes do cache atualizar. */
  const lastTextSendAtRef = useRef(0);
  const [openQuickReplyCategoryId, setOpenQuickReplyCategoryId] = useState<
    string | null
  >(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [metaTemplates, setMetaTemplates] = useState<
    { name: string; language?: string }[]
  >([]);
  const [metaTemplatesLoading, setMetaTemplatesLoading] = useState(false);
  const [metaTemplatesError, setMetaTemplatesError] = useState<string | null>(
    null,
  );
  const [templateSendBusy, setTemplateSendBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  const conn = conversation.whatsappConnection;
  const { phone, connectionId, channelActive } =
    resolveInboxSendContext(conversation);
  const aiReadOnly =
    (conversation.qualificationMode ?? "NONE") === "AI_ACTIVE" ||
    (conversation.qualificationMode ?? "NONE") === "AI_PAUSED";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.messages.length, conversation.id]);

  useEffect(() => {
    setOpenQuickReplyCategoryId(null);
    setOlderError(null);
  }, [conversation.id]);

  const loadOlderMessages = useCallback(async () => {
    const oldestId = conversation.messages[0]?.id;
    if (!oldestId || loadingOlder) return;
    setOlderError(null);
    setLoadingOlder(true);
    try {
      const r = await fetchOlderInboxMessages(conversation.id, oldestId);
      const incoming = r.messages as InboxMessage[];
      queryClient.setQueryData<InboxConversation | undefined>(
        inboxQueryKeys.conversation(conversation.id),
        (old) => {
          if (!old) return old;
          const byId = new Map<string, InboxMessage>();
          for (const m of [...incoming, ...old.messages]) {
            byId.set(m.id, m);
          }
          const merged = [...byId.values()].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime(),
          );
          return {
            ...old,
            messages: merged,
            hasOlderMessages: r.hasOlderMessages,
          };
        },
      );
      const el = scrollRef.current;
      if (el && incoming.length > 0) {
        const prevScrollHeight = el.scrollHeight;
        requestAnimationFrame(() => {
          const next = scrollRef.current;
          if (next) {
            next.scrollTop += next.scrollHeight - prevScrollHeight;
          }
        });
      }
    } catch (e) {
      setOlderError(
        e instanceof Error ? e.message : "Não foi possível carregar mensagens anteriores.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [conversation.id, conversation.messages, loadingOlder, queryClient]);

  useEffect(() => {
    if (conn?.provider !== "META" || !conn.isActive) {
      setMetaTemplates([]);
      setMetaTemplatesError(null);
      return;
    }
    let cancelled = false;
    setMetaTemplatesLoading(true);
    setMetaTemplatesError(null);
    void (async () => {
      try {
        const r = await listMetaTemplates(conn.id);
        if (!cancelled) setMetaTemplates(r.templates);
      } catch (e) {
        if (!cancelled) {
          setMetaTemplates([]);
          setMetaTemplatesError(
            e instanceof Error ? e.message : "Não foi possível carregar templates",
          );
        }
      } finally {
        if (!cancelled) setMetaTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conn?.id, conn?.provider, conn?.isActive]);

  const photo = getContactPhotoUrl(conversation.contact);

  const showQuickReplies = quickRepliesHaveScripts(quickReplyCategories);
  const messagesApi = `/api/inbox/conversations/${encodeURIComponent(conversation.id)}/messages`;

  const sendMedia = useCallback(
    async (args: {
      mediaKind: "audio" | "image" | "document";
      mediaDataUrl: string;
      fileName?: string;
      caption?: string;
    }) => {
      if (!channelActive || !connectionId || !phone) {
        setMediaError(
          !connectionId
            ? "Canal WhatsApp não vinculado. Recarregue a página."
            : !phone
              ? "Contato sem telefone para envio."
              : "Canal WhatsApp inativo.",
        );
        return;
      }
      setMediaError(null);
      setMediaBusy(true);
      try {
        await inboxApiPost(messagesApi, {
          connectionId,
          toPhone: phone,
          ...args,
        });
        onRefetch();
      } catch (e) {
        setMediaError(formatInboxSendError(e));
      } finally {
        setMediaBusy(false);
      }
    },
    [channelActive, connectionId, phone, messagesApi, onRefetch],
  );

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  async function onAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !phone) return;
    const kind = attachmentKind(file);
    if (!kind) {
      setMediaError("Envie uma imagem ou um PDF.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    await sendMedia({
      mediaKind: kind,
      mediaDataUrl: dataUrl,
      fileName: file.name,
    });
  }

  async function toggleRecording() {
    if (!channelActive || !connectionId || !phone || mediaBusy) return;
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        void (async () => {
          const blob = new Blob(chunksRef.current, {
            type: mr.mimeType || "audio/webm",
          });
          chunksRef.current = [];
          if (blob.size < 256) {
            setMediaError("Áudio muito curto.");
            return;
          }
          const dataUrl = await readFileAsDataUrl(
            new File([blob], "gravacao.webm", { type: blob.type }),
          );
          await sendMedia({
            mediaKind: "audio",
            mediaDataUrl: dataUrl,
            fileName: "gravacao.webm",
          });
        })();
      };
      recorderRef.current = mr;
      mr.start(250);
      setIsRecording(true);
    } catch {
      setMediaError("Microfone negado ou indisponível.");
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!connectionId || !phone) {
      setSendError(
        !connectionId
          ? "Canal WhatsApp não vinculado. Recarregue a página."
          : "Contato sem telefone para envio.",
      );
      return;
    }
    if (!channelActive) {
      setSendError("Canal WhatsApp inativo. Reconecte em Configurações.");
      return;
    }
    const now = Date.now();
    if (now - lastTextSendAtRef.current < 450) return;
    lastTextSendAtRef.current = now;

    setSendError(null);
    setText("");

    const optimistic = buildOptimisticOutboundMessage(conversation, trimmed);
    queryClient.setQueryData<InboxQueryData>(INBOX_QUERY_KEY, (old) => {
      if (!old?.conversations?.length) return old;
      return {
        conversations: old.conversations.map((c) =>
          c.id === conversation.id
            ? {
                ...c,
                messages: (() => {
                  const prev = c.messages;
                  const keep = prev.length <= 1 ? prev : prev.slice(-1);
                  return [...keep, optimistic];
                })(),
                lastMessageAt: new Date(),
              }
            : c,
        ),
      };
    });
    queryClient.setQueryData<InboxConversation | undefined>(
      inboxQueryKeys.conversation(conversation.id),
      (old) => {
        if (!old) return old;
        return { ...old, messages: [...old.messages, optimistic] };
      },
    );

    try {
      await inboxApiPost(messagesApi, {
        connectionId,
        toPhone: phone,
        text: trimmed,
      });
      void onRefetch();
    } catch (err) {
      const pendingId = optimistic.id;
      queryClient.setQueryData<InboxQueryData>(INBOX_QUERY_KEY, (old) => {
        if (!old?.conversations?.length) return old;
        return {
          conversations: old.conversations.map((c) =>
            c.id === conversation.id
              ? {
                  ...c,
                  messages: c.messages.filter((m) => m.id !== pendingId),
                }
              : c,
          ),
        };
      });
      queryClient.setQueryData<InboxConversation | undefined>(
        inboxQueryKeys.conversation(conversation.id),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.filter((m) => m.id !== pendingId),
          };
        },
      );
      setText(trimmed);
      setSendError(formatInboxSendError(err));
    }
  }

  async function onDeleteConversation() {
    if (deleteBusy) return;
    const label = conversation.contact.name || conversation.contact.phone || "esta conversa";
    if (
      !confirm(
        `Apagar a conversa com ${label}? As mensagens serão removidas do Atendimento (o contato no CRM permanece).`,
      )
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      await inboxApiDelete(
        `/api/inbox/conversations/${encodeURIComponent(conversation.id)}`,
      );
      onDeleted?.();
    } catch (e) {
      alert(formatInboxSendError(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function sendSelectedTemplate(t: { name: string; language?: string }) {
    if (conn?.provider !== "META" || !phone || !connectionId) return;
    const lang = (t.language ?? "pt_BR").trim();
    setTemplateSendBusy(true);
    setSendError(null);
    try {
      await inboxApiPost(messagesApi, {
        connectionId,
        toPhone: phone,
        templateName: t.name,
        language: lang,
      });
      setTemplateDialogOpen(false);
      onRefetch();
    } catch (e) {
      setSendError(formatInboxSendError(e));
    } finally {
      setTemplateSendBusy(false);
    }
  }

  async function onAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setNoteLoading(true);
    try {
      await addConversationNote({
        conversationId: conversation.id,
        body: noteText.trim(),
      });
      setNoteText("");
      onRefetch();
    } finally {
      setNoteLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/20 px-4 py-3 dark:border-border/30">
        <div className="flex items-center gap-3">
          <ContactPhotoAvatar
            photoUrl={photo}
            name={conversation.contact.name}
            sizeClass="size-9"
          />
          <div>
            <p className="text-sm font-semibold">{conversation.contact.name}</p>
            <p className="text-xs text-muted-foreground">
              {conversation.contact.phone ?? "Sem telefone"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          title="Apagar conversa"
          disabled={deleteBusy}
          onClick={() => void onDeleteConversation()}
        >
          {deleteBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
        <Button
          variant={showNotes ? "secondary" : "ghost"}
          size="icon"
          className="size-8"
          title="Notas internas"
          onClick={() => setShowNotes(!showNotes)}
        >
          <FileText className="size-4" />
        </Button>
        </div>
      </div>

      {/* Main area: messages or notes */}
      {showNotes ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border/20 px-4 py-2 dark:border-border/30">
            <p className="text-xs font-medium text-muted-foreground">
              Notas internas — visível só para a equipe
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {conversation.internalNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
            ) : (
              <ul className="space-y-3">
                {conversation.internalNotes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg bg-muted/50 p-3 text-sm dark:bg-muted/30"
                  >
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.user.name ?? n.user.email} ·{" "}
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form
            onSubmit={onAddNote}
            className="flex shrink-0 gap-2 border-t border-border/20 p-3 dark:border-border/30"
          >
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Registrar observação interna…"
              className="h-9 text-sm"
            />
            <Button type="submit" size="sm" disabled={noteLoading || !noteText.trim()}>
              {noteLoading ? "Salvando…" : "Salvar"}
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <QualificationBanner
            conversation={conversation}
            larissaEnabled={larissaEnabled}
            onTakeover={onRefetch}
          />
          {/* Messages */}
          <div
            ref={scrollRef}
            className="inbox-chat-messages-pattern min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
          >
            {conversation.hasOlderMessages ? (
              <div className="mb-3 flex flex-col items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={loadingOlder}
                  onClick={() => void loadOlderMessages()}
                >
                  {loadingOlder ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                      Carregando…
                    </>
                  ) : (
                    "Carregar mensagens anteriores"
                  )}
                </Button>
                {olderError ? (
                  <p className="text-center text-xs text-destructive">{olderError}</p>
                ) : null}
              </div>
            ) : null}
            {conversation.messages.map((m, i) => {
              const prev = conversation.messages[i - 1];
              const continuation = prev?.direction === m.direction;
              return (
                <div
                  key={m.id}
                  className={cn(continuation ? "mt-0.5" : "mt-2 first:mt-0")}
                >
                  <MessageBubble
                    body={m.body}
                    direction={m.direction}
                    senderType={m.senderType}
                    createdAt={m.createdAt}
                    continuation={continuation}
                    ackStatus={m.ackStatus}
                    mediaUrl={m.mediaUrl}
                    mediaType={m.mediaType}
                    audioTranscript={m.audioTranscript}
                    messageId={m.id}
                    contactPhotoUrl={
                      m.direction === "INBOUND"
                        ? getContactPhotoUrl(conversation.contact)
                        : undefined
                    }
                    contactName={conversation.contact.name}
                  />
                </div>
              );
            })}
          </div>

          {/* Quick replies + composer: fixos na base; só as mensagens rolam acima */}
          <div className="shrink-0 border-t border-border/20 bg-card dark:border-border/30">
            {showQuickReplies && !aiReadOnly ? (
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                {quickReplyCategories.map((cat) =>
                  cat.replies.length === 0 ? null : (
                    <DropdownMenu
                      key={cat.id}
                      open={openQuickReplyCategoryId === cat.id}
                      onOpenChange={(open) =>
                        setOpenQuickReplyCategoryId(open ? cat.id : null)
                      }
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 max-w-[12rem] shrink-0 select-none gap-1 border-0 bg-muted/70 px-2 text-xs shadow-none hover:bg-muted dark:bg-muted/50"
                          title={
                            openQuickReplyCategoryId === cat.id
                              ? `${cat.name} — fechar lista`
                              : `${cat.name} — abrir lista de scripts`
                          }
                          aria-expanded={openQuickReplyCategoryId === cat.id}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">
                            {cat.name}
                          </span>
                          {openQuickReplyCategoryId === cat.id ? (
                            <ChevronDown
                              className="size-3.5 shrink-0 opacity-70"
                              aria-hidden
                            />
                          ) : (
                            <ChevronUp
                              className="size-3.5 shrink-0 opacity-70"
                              aria-hidden
                            />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="max-h-[min(60vh,18rem)] w-[min(100vw-2rem,18rem)] cursor-pointer overflow-y-auto"
                      >
                        {cat.replies.map((q) => (
                          <DropdownMenuItem
                            key={q.id}
                            className="cursor-pointer flex-col items-start gap-0.5 py-2"
                            onSelect={() =>
                              setText((t) => (t ? `${t}\n${q.body}` : q.body))
                            }
                          >
                            <span className="font-medium">{q.title}</span>
                            <span className="line-clamp-2 text-xs font-normal text-muted-foreground">
                              {q.body}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                )}
              </div>
            ) : null}
            {mediaError ? (
              <p className="px-3 pb-0 text-xs text-destructive">{mediaError}</p>
            ) : null}
            {sendError ? (
              <p className="px-3 pb-0 text-xs text-destructive">{sendError}</p>
            ) : null}
            {aiReadOnly ? (
              <p className="border-t border-border/15 px-3 py-3 text-center text-xs text-muted-foreground dark:border-border/25">
                Assuma a conversa para enviar mensagens.
              </p>
            ) : (
            <form
              onSubmit={onSend}
              className={cn(
                "flex items-center gap-1.5 p-3",
                showQuickReplies &&
                  "border-t border-border/15 dark:border-border/25",
              )}
            >
              <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                <DialogContent className="max-h-[min(80vh,28rem)] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Enviar template (Meta)</DialogTitle>
                    <DialogDescription>
                      Templates aprovados na sua conta WABA. Use fora da janela de 24h ou
                      para início de conversa.
                    </DialogDescription>
                  </DialogHeader>
                  {metaTemplatesLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : metaTemplatesError ? (
                    <p className="text-sm text-destructive">{metaTemplatesError}</p>
                  ) : metaTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum template aprovado ou configure o WABA ID em Configurações →
                      Canais → Editar.
                    </p>
                  ) : (
                    <ul className="max-h-[min(50vh,20rem)] space-y-1 overflow-y-auto pr-1">
                      {metaTemplates.map((t) => (
                        <li key={`${t.name}:${t.language ?? ""}`}>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left text-sm"
                            disabled={templateSendBusy}
                            onClick={() => void sendSelectedTemplate(t)}
                          >
                            <span className="font-medium">{t.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t.language ?? "pt_BR"}
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setTemplateDialogOpen(false)}
                    >
                      Fechar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                tabIndex={-1}
                onChange={(e) => void onAttachmentChange(e)}
              />
              {conn?.provider === "META" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  disabled={!channelActive || !connectionId || mediaBusy}
                  title="Enviar template aprovado"
                  onClick={() => setTemplateDialogOpen(true)}
                >
                  <LayoutTemplate className="size-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled={!channelActive || !connectionId || mediaBusy}
                title="Anexar imagem ou PDF"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
              <Button
                type="button"
                variant={isRecording ? "destructive" : "ghost"}
                size="icon"
                className="size-9 shrink-0"
                disabled={!channelActive || !connectionId || mediaBusy}
                title={
                  isRecording ? "Parar e enviar áudio" : "Gravar áudio"
                }
                aria-pressed={isRecording}
                onClick={() => void toggleRecording()}
              >
                {mediaBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
              <Input
                value={text}
                onChange={(e) => {
                  setSendError(null);
                  setText(e.target.value);
                }}
                placeholder={
                  channelActive && connectionId
                    ? "Digite uma mensagem…"
                    : "Conecte o canal para enviar"
                }
                disabled={!channelActive || !connectionId || mediaBusy}
                className="h-9 min-w-0 flex-1 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                disabled={!channelActive || !connectionId || !text.trim() || mediaBusy}
              >
                <Send className="size-4" />
              </Button>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
