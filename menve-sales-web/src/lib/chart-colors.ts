/**
 * Paleta fixa legada (hex). Preferir `CHART_BAR_SEQUENCE` / `--chart-bar-*` no dashboard.
 */
export const CHART = {
  primary: "#171717",
  secondary: "#525252",
  tertiary: "#737373",
  quaternary: "#a3a3a3",
  muted: "#d4d4d4",
  loss: "#991b1b",
  win: "#15803d",
} as const;

/**
 * Sequência de cores para barras e fatias (variáveis `--chart-bar-*` em `globals.css`).
 */
export const CHART_BAR_SEQUENCE = [
  "var(--chart-bar-1)",
  "var(--chart-bar-2)",
  "var(--chart-bar-3)",
  "var(--chart-bar-4)",
  "var(--chart-bar-5)",
] as const;

/** Linhas (ex.: LineChart) — acompanha contraste do tema */
export const CHART_LINE_STROKE = "var(--chart-line-stroke)";
