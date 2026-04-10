import type { CSSProperties } from "react";

const DEFAULT_STAGE_HEX = "#7c3aed";

export function normalizedStageHex(
  color: string | null | undefined,
  fallback: string = DEFAULT_STAGE_HEX,
): string {
  const c = color?.trim();
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) return c;
  return fallback;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Luminância relativa sRGB (0–1). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexRgb(hex);
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Texto legível sobre fundo sólido da etapa. */
export function contrastingForegroundForStageBg(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? "#171717" : "#ffffff";
}

export function stageSolidPillStyle(
  color: string | null | undefined,
): CSSProperties {
  const bg = normalizedStageHex(color);
  return {
    backgroundColor: bg,
    color: contrastingForegroundForStageBg(bg),
  };
}
