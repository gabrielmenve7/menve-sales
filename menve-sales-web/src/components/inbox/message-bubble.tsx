import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceMessagePlayer } from "./voice-message-player";

/** Alinhado ao enum Prisma `MessageAckStatus` (enviada → entregue → lida). */
export type OutboundAckStatus = "SENT" | "DELIVERED" | "READ";

function OutboundAckIcons({ status }: { status: OutboundAckStatus }) {
  const read = status === "READ";
  const delivered = status === "DELIVERED" || read;
  const tickClass = cn(
    "size-3.5 stroke-[2.5]",
    read
      ? "text-[#6FD4F8]"
      : "text-primary-foreground/55 dark:text-primary-foreground/50",
  );

  if (!delivered) {
    return <Check className={tickClass} aria-hidden />;
  }

  return (
    <span
      className="relative inline-flex h-3.5 w-[22px] shrink-0"
      aria-label={read ? "Visualizada" : "Entregue"}
    >
      <Check className={cn(tickClass, "absolute left-0 top-0")} aria-hidden />
      <Check className={cn(tickClass, "absolute left-2 top-0")} aria-hidden />
    </span>
  );
}

export function MessageBubble({
  body,
  direction,
  createdAt,
  continuation,
  ackStatus,
  mediaUrl,
  mediaType,
  messageId,
  contactPhotoUrl,
  contactName,
}: {
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  createdAt: string | Date;
  continuation?: boolean;
  ackStatus?: OutboundAckStatus | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  messageId?: string;
  contactPhotoUrl?: string | null;
  contactName?: string;
}) {
  const ts = new Date(createdAt);
  const time = ts.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isOut = direction === "OUTBOUND";
  const ack: OutboundAckStatus | null = isOut
    ? (ackStatus ?? "DELIVERED")
    : null;

  const mt = mediaType?.toLowerCase() ?? "";

  const showAudio =
    !!mediaUrl && (mt.startsWith("audio/") || body === "[Áudio]");

  const showImage = !!mediaUrl && mt.startsWith("image/");

  const showPdf =
    !!mediaUrl &&
    (mt.includes("pdf") || mt === "application/x-pdf");

  const showTextBody =
    body &&
    (!showAudio || body !== "[Áudio]") &&
    !(showImage && (body === "[Imagem]" || !body.trim())) &&
    !(showPdf && body.startsWith("[Documento]"));

  if (showAudio && mediaUrl) {
    return (
      <div
        className={cn(
          "w-max max-w-[min(20rem,92%)]",
          isOut ? "ml-auto" : "mr-auto",
        )}
      >
        <VoiceMessagePlayer
          src={mediaUrl}
          mimeType={mediaType}
          variant={isOut ? "outgoing" : "incoming"}
          messageId={messageId ?? mediaUrl.slice(0, 32)}
          wallClockTime={time}
          contactPhotoUrl={!isOut ? contactPhotoUrl : undefined}
          contactName={!isOut ? contactName : undefined}
        />
        {isOut && ack ? (
          <div className="mt-1 flex justify-end gap-1 pr-1">
            <OutboundAckIcons status={ack} />
          </div>
        ) : null}
      </div>
    );
  }

  if (showImage && mediaUrl) {
    return (
      <div
        className={cn(
          "w-max max-w-[min(20rem,92%)] overflow-hidden rounded-xl shadow-sm",
          isOut ? "ml-auto" : "mr-auto",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt=""
          className="max-h-72 w-full max-w-full object-contain"
        />
        {showTextBody ? (
          <p
            className={cn(
              "px-2.5 py-1.5 text-sm leading-snug",
              isOut
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-foreground dark:bg-muted/35",
            )}
          >
            {body}
          </p>
        ) : null}
        <div
          className={cn(
            "flex items-end justify-end gap-1 px-2 pb-1.5 pt-0.5 text-[11px]",
            isOut ? "text-primary-foreground/65" : "text-muted-foreground",
          )}
        >
          <span className="select-none tabular-nums">{time}</span>
          {isOut && ack ? <OutboundAckIcons status={ack} /> : null}
        </div>
      </div>
    );
  }

  if (showPdf && mediaUrl) {
    return (
      <div
        className={cn(
          "w-max max-w-[min(21rem,82%)] rounded-xl px-2.5 py-2 text-sm shadow-sm",
          isOut
            ? "ml-auto bg-primary text-primary-foreground"
            : "mr-auto bg-muted/60 text-foreground dark:bg-muted/35",
        )}
      >
        <a
          href={mediaUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "font-medium underline underline-offset-2",
            isOut ? "text-primary-foreground" : "text-foreground",
          )}
        >
          Abrir PDF
        </a>
        {showTextBody ? (
          <p className="mt-1 text-xs opacity-90">{body}</p>
        ) : null}
        <div
          className={cn(
            "mt-1 flex items-end justify-end gap-1 text-[11px]",
            isOut ? "text-primary-foreground/65" : "text-muted-foreground",
          )}
        >
          <span className="select-none tabular-nums">{time}</span>
          {isOut && ack ? <OutboundAckIcons status={ack} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-max max-w-[min(21rem,82%)] px-2.5 py-1.5 text-sm leading-snug shadow-sm",
        continuation ? "rounded-lg" : null,
        !continuation && isOut && "rounded-bl-lg rounded-br-lg rounded-tl-lg rounded-tr-sm",
        !continuation && !isOut && "rounded-br-lg rounded-tl-sm rounded-tr-lg rounded-bl-lg",
        isOut
          ? "ml-auto bg-primary text-primary-foreground"
          : "mr-auto bg-muted/60 text-foreground dark:bg-muted/35 dark:text-foreground",
      )}
    >
      <div className="flex flex-col gap-2">
        {body === "[Áudio]" && !showAudio ? (
          <p className="text-xs text-muted-foreground">
            Áudio recebido, mas o arquivo não está disponível. Em Canais, reaplique o
            webhook na Evolution com envio de mídia em base64 (ou envie outro áudio
            após atualizar a API).
          </p>
        ) : null}
        {showTextBody ? (
          <p className="min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {body}
          </p>
        ) : null}
        <div
          className={cn(
            "flex items-end justify-end gap-1",
            isOut ? "text-primary-foreground/65" : "text-muted-foreground",
          )}
        >
          <span className="select-none whitespace-nowrap pb-px text-[11px] tabular-nums leading-none">
            {time}
          </span>
          {ack ? <OutboundAckIcons status={ack} /> : null}
        </div>
      </div>
    </div>
  );
}
