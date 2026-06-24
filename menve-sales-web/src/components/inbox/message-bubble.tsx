import { cn } from "@/lib/utils";
import {
  OutboundAckIcons,
  type OutboundAckStatus,
} from "./outbound-ack-icons";
import { VoiceMessagePlayer } from "./voice-message-player";

export type { OutboundAckStatus };

type SenderType =
  | "LEAD"
  | "HUMAN_AGENT"
  | "AI_AGENT"
  | "SYSTEM"
  | "CAMPAIGN";

export function MessageBubble({
  body,
  direction,
  senderType,
  createdAt,
  continuation,
  ackStatus,
  mediaUrl,
  mediaType,
  audioTranscript,
  messageId,
  contactPhotoUrl,
  contactName,
}: {
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType?: SenderType;
  createdAt: string | Date;
  continuation?: boolean;
  ackStatus?: OutboundAckStatus | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  audioTranscript?: string | null;
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
  const isAi = senderType === "AI_AGENT";
  const isCampaign = senderType === "CAMPAIGN";
  const senderLabel = isAi
    ? "Gabriel · Agente IA"
    : isCampaign
      ? "Abordagem"
      : isOut
        ? "Você"
        : contactName?.trim() || "Lead";

  const outBg = isAi
    ? "bg-violet-600 text-white"
    : isCampaign
      ? "bg-slate-600 text-white"
      : "bg-primary-solid text-primary-solid-fg";

  const outFg =
    isAi || isCampaign ? "text-white/70" : "text-primary-solid-fg/65";

  const ack: OutboundAckStatus | null = isOut
    ? (ackStatus ?? "DELIVERED")
    : null;

  const mt = mediaType?.toLowerCase() ?? "";
  const showAudio =
    !!mediaUrl && (mt.startsWith("audio/") || body === "[Áudio]");
  const showImage = !!mediaUrl && mt.startsWith("image/");
  const showPdf =
    !!mediaUrl && (mt.includes("pdf") || mt === "application/x-pdf");
  const showTextBody =
    body &&
    (!showAudio || body !== "[Áudio]") &&
    !(showImage && (body === "[Imagem]" || !body.trim())) &&
    !(showPdf && body.startsWith("[Documento]"));

  const label = !continuation ? (
    <span className="mb-0.5 block px-1 text-[10px] font-medium text-muted-foreground">
      {senderLabel}
    </span>
  ) : null;

  if (showAudio && mediaUrl) {
    return (
      <div className={cn(isOut ? "ml-auto" : "mr-auto", "w-max max-w-[min(20rem,92%)]")}>
        {label}
        <VoiceMessagePlayer
          src={mediaUrl}
          mimeType={mediaType}
          variant={isOut ? "outgoing" : "incoming"}
          messageId={messageId ?? mediaUrl.slice(0, 32)}
          wallClockTime={time}
          contactPhotoUrl={!isOut ? contactPhotoUrl : undefined}
          contactName={!isOut ? contactName : undefined}
        />
        {audioTranscript?.trim() ? (
          <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-violet-700 dark:text-violet-300">
              Gabriel ouviu:
            </span>{" "}
            {audioTranscript.trim()}
          </p>
        ) : null}
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
        {label}
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
              isOut ? outBg : "bg-muted/60 text-foreground dark:bg-muted/35",
            )}
          >
            {body}
          </p>
        ) : null}
        <div
          className={cn(
            "flex items-end justify-end gap-1 px-2 pb-1.5 pt-0.5 text-[11px]",
            isOut ? outFg : "text-muted-foreground",
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
          isOut ? cn("ml-auto", outBg) : "mr-auto bg-muted/60 text-foreground dark:bg-muted/35",
        )}
      >
        {label}
        <a
          href={mediaUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Abrir PDF
        </a>
        {showTextBody ? (
          <p className="mt-1 text-xs opacity-90">{body}</p>
        ) : null}
        <div
          className={cn(
            "mt-1 flex items-end justify-end gap-1 text-[11px]",
            isOut ? outFg : "text-muted-foreground",
          )}
        >
          <span className="select-none tabular-nums">{time}</span>
          {isOut && ack ? <OutboundAckIcons status={ack} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(isOut ? "ml-auto" : "mr-auto", "w-max max-w-[min(21rem,82%)]")}>
      {label}
      <div
        className={cn(
          "px-2.5 py-1.5 text-sm leading-snug shadow-sm",
          continuation ? "rounded-lg" : null,
          !continuation &&
            isOut &&
            "rounded-bl-lg rounded-br-lg rounded-tl-lg rounded-tr-sm",
          !continuation &&
            !isOut &&
            "rounded-br-lg rounded-tl-sm rounded-tr-lg rounded-bl-lg",
          isOut ? outBg : "mr-auto bg-muted/60 text-foreground dark:bg-muted/35",
        )}
      >
        <div className="flex flex-col gap-2">
          {body === "[Áudio]" && !showAudio ? (
            <p className="text-xs text-muted-foreground">
              Áudio recebido, mas o arquivo não está disponível.
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
              isOut ? outFg : "text-muted-foreground",
            )}
          >
            <span className="select-none whitespace-nowrap pb-px text-[11px] tabular-nums leading-none">
              {time}
            </span>
            {ack ? <OutboundAckIcons status={ack} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
