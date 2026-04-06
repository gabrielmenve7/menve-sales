"use client";

import type { QuickReply } from "@prisma/client";
import { FileText, Send } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { addConversationNote } from "@/actions/conversation-notes";
import { sendWhatsAppMessage } from "@/actions/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InboxConversation } from "./inbox-types";
import { getContactPhotoUrl, initials } from "./inbox-utils";
import { MessageBubble } from "./message-bubble";

export function ChatPanel({
  conversation,
  quickReplies,
  onRefetch,
}: {
  conversation: InboxConversation;
  quickReplies: QuickReply[];
  onRefetch: () => void;
}) {
  const [text, setText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.messages.length, conversation.id]);

  const photo = getContactPhotoUrl(conversation.contact);
  const conn = conversation.whatsappConnection;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !conn) return;
    const phone = conversation.contact.phone;
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
            {quickReplies.length > 0 ? (
              <div className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {quickReplies.map((q) => (
                    <Button
                      key={q.id}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 border-0 bg-muted/70 text-xs shadow-none hover:bg-muted dark:bg-muted/50"
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
            <form
              onSubmit={onSend}
              className={cn(
                "flex items-center gap-2 p-3",
                quickReplies.length > 0 &&
                  "border-t border-border/15 dark:border-border/25",
              )}
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  conn?.isActive
                    ? "Digite uma mensagem…"
                    : "Conecte o canal para enviar"
                }
                disabled={!conn?.isActive}
                className="h-9 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                disabled={!conn?.isActive || !text.trim()}
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
