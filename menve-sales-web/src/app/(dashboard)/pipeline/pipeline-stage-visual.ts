import type { Stage } from "@prisma/client";
import type { CSSProperties } from "react";

export const FALLBACK_STAGE_HEX = [
  "#2563eb",
  "#7c3aed",
  "#d97706",
  "#e11d48",
  "#059669",
  "#0284c7",
];

export function stageAccentHex(stage: Stage, index: number): string {
  const c = stage.color?.trim();
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) return c;
  return FALLBACK_STAGE_HEX[index % FALLBACK_STAGE_HEX.length]!;
}

export function columnSurfaceStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, var(--background) 98.5%, ${hex} 1.5%)`,
  };
}

export function stageBadgeStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, var(--card) 78%, ${hex} 22%)`,
    color: `color-mix(in srgb, ${hex} 72%, var(--foreground) 28%)`,
  };
}
