"use client";

import {
  ChevronDown,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Send,
} from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { addConversationNote } from "@/actions/conversation-notes";
import {
  sendWhatsAppMediaMessage,
  sendWhatsAppMessage,
} from "@/actions/messages";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { QuickReplyCategoryDTO } from "@/lib/quick-reply-types";
import { quickRepliesHaveScripts } from "@/lib/quick-reply-types";
import type { InboxConversation } from "./inbox-types";
import { getContactPhotoUrl, initials } from "./inbox-utils";
import { MessageBubble } from "./message-bubble";

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Leitura do arquivo falhou"));
    r.readAsDataURL(file);
  });
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
  onRefetch,
}: {
  conversation: InboxConversation;
  quickReplyCategories: QuickReplyCategoryDTO[];
  onRefetch: () => void;
}) {
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.messages.length, conversation.id]);

  const photo = getContactPhotoUrl(conversation.contact);
  const conn = conversation.whatsappConnection;
  const phone = conversation.contact.phone;

  const showQuickReplies = quickRepliesHaveScripts(quickReplyCategories);

  const sendMedia = useCallback(
    async (args: {
      mediaKind: "audio" | "image" | "document";
      mediaDataUrl: string;
      fileName?: string;
      caption?: string;
    }) => {
      if (!conn?.isActive || !phone) return;
      setMediaError(null);
      setMediaBusy(true);
      try {
        await sendWhatsAppMediaMessage({
          conversationId: conversation.id,
          connectionId: conn.id,
          toPhone: phone,
          ...args,
        });
        onRefetch();
      } catch (e) {
        setMediaError(
          e instanceof Error ? e.message : "Falha ao enviar mídia",
        );
      } finally {
        setMediaBusy(false);
      }
    },
    [conn, phone, conversation.id, onRefetch],
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
    if (!conn?.isActive || !phone || mediaBusy) return;
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
    if (!text.trim() || !conn) return;
    if (!phone) return;
    await sendWhatsAppMessage({
      conversationId: conversation.id,
      connectionId: conn.id,
      toPhone: phone,
      text: text.trim(),
    });
    setText("");
    onRefetch();
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
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {initials(conversation.contact.name)}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold">{conversation.contact.name}</p>
            <p className="text-xs text-muted-foreground">
              {conversation.contact.phone ?? "Sem telefone"}
            </p>
          </div>
        </div>
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
          {/* Messages */}
          <div
            ref={scrollRef}
            className="inbox-chat-messages-pattern min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
          >
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
                    createdAt={m.createdAt}
                    continuation={continuation}
                    ackStatus={m.ackStatus}
                    mediaUrl={m.mediaUrl}
                    mediaType={m.mediaType}
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
            {showQuickReplies ? (
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                {quickReplyCategories.map((cat) =>
                  cat.replies.length === 0 ? null : (
                    <DropdownMenu key={cat.id}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 max-w-[12rem] shrink-0 gap-1 border-0 bg-muted/70 px-2 text-xs shadow-none hover:bg-muted dark:bg-muted/50"
                          title={`${cat.name} — abrir scripts`}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">
                            {cat.name}
                          </span>
                          <ChevronDown
                            className="size-3.5 shrink-0 opacity-70"
                            aria-hidden
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="max-h-[min(60vh,18rem)] w-[min(100vw-2rem,18rem)] overflow-y-auto"
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
            <form
              onSubmit={onSend}
              className={cn(
                "flex items-center gap-1.5 p-3",
                showQuickReplies &&
                  "border-t border-border/15 dark:border-border/25",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                tabIndex={-1}
                onChange={(e) => void onAttachmentChange(e)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled={!conn?.isActive || mediaBusy}
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
                disabled={!conn?.isActive || mediaBusy}
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
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  conn?.isActive
                    ? "Digite uma mensagem…"
                    : "Conecte o canal para enviar"
                }
                disabled={!conn?.isActive || mediaBusy}
                className="h-9 min-w-0 flex-1 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                disabled={!conn?.isActive || !text.trim() || mediaBusy}
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
