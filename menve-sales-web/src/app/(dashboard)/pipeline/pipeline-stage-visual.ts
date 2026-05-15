import type { CSSProperties } from "react";
import { normalizedStageHex } from "@/lib/stage-pill-style";

/** Quando a etapa não tem cor válida, o tom da coluna aproxima um cinza neutro. */
const COLUMN_TINT_FALLBACK_HEX = "#94a3b8";

/**
 * Fundo suave da coluna Kanban — mistura a cor da etapa com o fundo da página.
 * A parcela da cor da etapa é ~3% (metade dos ~6% anteriores) para fundo mais discreto.
 */
export function columnSurfaceStyle(
  stageColor: string | null | undefined,
): CSSProperties {
  const hex = normalizedStageHex(stageColor, COLUMN_TINT_FALLBACK_HEX);
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 3%, var(--background))`,
  };
}
