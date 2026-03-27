/** Paleta neutra (preto/cinza) para Recharts — alinhada ao tema ChatGPT-like */
export const CHART = {
  primary: "#171717",
  secondary: "#525252",
  tertiary: "#737373",
  quaternary: "#a3a3a3",
  muted: "#d4d4d4",
  loss: "#991b1b",
  win: "#15803d",
} as const;

export const CHART_BAR_SEQUENCE = [
  CHART.primary,
  CHART.secondary,
  CHART.tertiary,
  CHART.quaternary,
  CHART.muted,
] as const;
