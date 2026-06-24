import { WhatsAppLogo } from "@/components/icons/whatsapp-logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ContactPhotoAvatar } from "./contact-photo-avatar";
import type { InboxContact, InboxConversation } from "./inbox-types";
import { OutboundAckIcons, type OutboundAckStatus } from "./outbound-ack-icons";
import { relativeTime, getContactPhotoUrl } from "./inbox-utils";

type BadgeConfig =
  | { bg: string; kind: "whatsapp" }
  | { bg: string; kind: "text"; label: string };

const PROVIDER_BADGE: Record<string, BadgeConfig> = {
  EVOLUTION: { bg: "bg-green-500", kind: "whatsapp" },
  ZAPPFY: { bg: "bg-emerald-600", kind: "whatsapp" },
  META: { bg: "bg-green-600", kind: "whatsapp" },
  INSTAGRAM: { bg: "bg-fuchsia-500", kind: "text", label: "IG" },
};

function outreachCampaignLabel(contact: InboxContact): string | null {
  if (contact.outreachCampaignName?.trim()) {
    return contact.outreachCampaignName.trim();
  }
  if (contact.utmSource === "outreach") {
    return contact.campaignSource?.name ?? "Campanha";
  }
  if (contact.campaignSource?.code === "outreach") {
    return contact.campaignSource.name;
  }
  return null;
}

export function ConversationItem({
  conversation,
  selected,
  onClick,
}: {
  conversation: InboxConversation;
  selected: boolean;
  onClick: () => void;
}) {
  const c = conversation;
  const photo = getContactPhotoUrl(c.contact);
  const lastMsg = c.messages.at(-1);
  const isOutbound = lastMsg?.direction === "OUTBOUND";
  const outboundAck: OutboundAckStatus | null =
    isOutbound && lastMsg ? (lastMsg.ackStatus ?? "DELIVERED") : null;
  const preview = lastMsg?.body
    ? lastMsg.body.length > 40
      ? lastMsg.body.slice(0, 40) + "…"
      : lastMsg.body
    : null;
  const badge = PROVIDER_BADGE[c.whatsappConnection?.provider ?? ""];
  const campaignLabel = outreachCampaignLabel(c.contact);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
        selected && "bg-muted/50",
      )}
    >
      <div className="relative shrink-0">
        <ContactPhotoAvatar photoUrl={photo} name={c.contact.name} sizeClass="size-9" />
        {badge && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-white",
              badge.bg,
            )}
            aria-label={
              badge.kind === "whatsapp" ? "WhatsApp" : badge.label
            }
          >
            {badge.kind === "whatsapp" ? (
              <WhatsAppLogo className="size-2.5 shrink-0" />
            ) : (
              <span className="text-[7px] font-bold">{badge.label}</span>
            )}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium">{c.contact.name}</p>
            {campaignLabel ? (
              <Badge
                variant="secondary"
                className="h-4 shrink-0 px-1 text-[9px] font-normal"
                title={`Origem: ${campaignLabel}`}
              >
                {campaignLabel.length > 14
                  ? `${campaignLabel.slice(0, 14)}…`
                  : campaignLabel}
              </Badge>
            ) : null}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {c.lastMessageAt ? relativeTime(new Date(c.lastMessageAt)) : ""}
          </span>
        </div>
        {preview && (
          <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            {outboundAck ? (
              <>
                <OutboundAckIcons status={outboundAck} variant="onList" />
                <span className="shrink-0">Você: </span>
              </>
            ) : null}
            <span className="min-w-0 truncate">{preview}</span>
          </p>
        )}
      </div>
    </button>
  );
}
