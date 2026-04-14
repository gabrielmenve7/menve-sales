/** Chave antiga do seletor de cor removido; limpamos na hidratação para não conflitar com o tema fixo. */
export const LEGACY_ACCENT_STORAGE_KEY = "menve.accent";

/** Remove `data-accent` do `<html>` e a chave antiga do `localStorage` (tema verde fixo em `globals.css`). */
export function clearLegacyAccentTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-accent");
  try {
    localStorage.removeItem(LEGACY_ACCENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
