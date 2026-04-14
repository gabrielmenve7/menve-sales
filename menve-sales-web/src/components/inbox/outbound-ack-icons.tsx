import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Alinhado ao enum Prisma `MessageAckStatus` (enviada → entregue → lida). */
export type OutboundAckStatus = "SENT" | "DELIVERED" | "READ";

export function OutboundAckIcons({
  status,
  variant = "onBubble",
}: {
  status: OutboundAckStatus;
  variant?: "onBubble" | "onList";
}) {
  const read = status === "READ";
  const delivered = status === "DELIVERED" || read;
  const size = variant === "onList" ? "size-3" : "size-3.5";
  const tickClass = cn(
    size,
    "shrink-0 stroke-[2.5]",
    read
      ? "text-[#6FD4F8]"
      : variant === "onList"
        ? "text-muted-foreground/75"
        : "text-primary-solid-fg/55 dark:text-primary-solid-fg/50",
  );

  if (!delivered) {
    return (
      <Check className={tickClass} aria-hidden aria-label="Enviada" />
    );
  }

  const isList = variant === "onList";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center",
        isList ? "h-3 w-[13px]" : "h-3.5 w-[15px]",
      )}
      aria-label={read ? "Visualizada" : "Entregue"}
    >
      <Check className={cn(tickClass, "absolute left-0 top-0")} aria-hidden />
      <Check
        className={cn(
          tickClass,
          "absolute top-0",
          isList ? "left-[3px]" : "left-[4px]",
        )}
        aria-hidden
      />
    </span>
  );
}
