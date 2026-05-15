"use client";

import type { StageLifecycle } from "@prisma/client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const R = 7;
const CX = 10;
const CY = 10;
const CIRC = 2 * Math.PI * R;

function parseHex(hex: string | null | undefined): string | null {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return hex;
}

export type StageLifecycleRingProps = {
  lifecycle: StageLifecycle;
  /** 0–1: preenchimento do arco em etapas “Ativo” (estilo relógio). */
  activeProgress?: number;
  /** Cor da etapa (#RRGGBB) para o anel ativo. */
  accentHex?: string | null;
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Indicador circular por categoria de etapa (não iniciado → ativo → feito → fechado).
 */
export function StageLifecycleRing({
  lifecycle,
  activeProgress = 0.45,
  accentHex,
  size = 20,
  className,
  title,
}: StageLifecycleRingProps) {
  if (lifecycle === "NOT_STARTED") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={cn("shrink-0 text-muted-foreground/55", className)}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? "img" : undefined}
      >
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="2.2 3.2"
        />
      </svg>
    );
  }

  if (lifecycle === "ACTIVE") {
    const progress = Math.min(1, Math.max(0, activeProgress));
    const dash = CIRC * progress;
    const accentStroke = parseHex(accentHex);
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={cn("shrink-0", className)}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? "img" : undefined}
      >
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/35"
          strokeWidth={2.5}
        />
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={accentStroke ?? "currentColor"}
          className={accentStroke ? undefined : "text-primary"}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
      </svg>
    );
  }

  if (lifecycle === "DONE") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white ring-1 ring-black/10 dark:bg-neutral-200 dark:text-neutral-900 dark:ring-white/15",
          className,
        )}
        style={{ width: size, height: size }}
        title={title}
        aria-hidden
      >
        <Check className="size-[55%]" strokeWidth={3} />
      </span>
    );
  }

  /* CLOSED */
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white ring-1 ring-emerald-700/25 dark:bg-emerald-500 dark:ring-emerald-400/20",
        className,
      )}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden
    >
      <Check className="size-[55%]" strokeWidth={3} />
    </span>
  );
}
