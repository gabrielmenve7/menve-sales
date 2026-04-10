/**
 * Paleta fixa (métricas semânticas). Para barras/pizza sobre `bg-card`, prefira
 * `CHART_BAR_SEQUENCE` — cores fixas escuras somem no tema escuro.
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
 * Barras e fatias: `globals.css` define `--chart-bar-*` (cinza no tema claro,
 * branco/off-white no `.dark`).
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
