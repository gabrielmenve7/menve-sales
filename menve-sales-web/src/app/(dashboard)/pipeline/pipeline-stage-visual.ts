import type { CSSProperties } from "react";

/** Fundo da coluna Kanban — sempre neutro (sem tint por etapa). */
export function columnSurfaceStyle(): CSSProperties {
  return {
    backgroundColor:
      "color-mix(in srgb, var(--kanban-column) 80%, transparent)",
  };
}
