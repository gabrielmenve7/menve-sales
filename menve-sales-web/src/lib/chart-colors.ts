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
 * Barras e fatias: segue `--primary`, `--foreground`, etc., para contraste em
 * light e dark (cartão claro vs escuro).
 */
export const CHART_BAR_SEQUENCE = [
  "var(--primary)",
  "var(--foreground)",
  "var(--muted-foreground)",
  "var(--ring)",
  "var(--secondary-foreground)",
] as const;

/** Linhas (ex.: LineChart) — mesma lógica tema-aware */
export const CHART_LINE_STROKE = "var(--primary)";
