export const ACCENT_STORAGE_KEY = "menve.accent";

export type AccentId =
  | "slate"
  | "purple"
  | "blue"
  | "pink"
  | "violet"
  | "indigo"
  | "orange"
  | "teal"
  | "bronze"
  | "mint";

export const ACCENT_OPTIONS: {
  id: AccentId;
  label: string;
  swatch: string;
}[] = [
  { id: "slate", label: "Preto", swatch: "#171717" },
  { id: "purple", label: "Roxo", swatch: "#7c3aed" },
  { id: "blue", label: "Azul", swatch: "#2563eb" },
  { id: "pink", label: "Rosa", swatch: "#db2777" },
  { id: "violet", label: "Violeta", swatch: "#8b5cf6" },
  { id: "indigo", label: "Anil", swatch: "#4f46e5" },
  { id: "orange", label: "Laranja", swatch: "#ea580c" },
  { id: "teal", label: "Azul-petróleo", swatch: "#0d9488" },
  { id: "bronze", label: "Bronze", swatch: "#b45309" },
  { id: "mint", label: "Menta", swatch: "#059669" },
];

export function isAccentId(v: string | null | undefined): v is AccentId {
  return ACCENT_OPTIONS.some((a) => a.id === v);
}

export function readStoredAccent(): AccentId {
  if (typeof window === "undefined") return "slate";
  try {
    const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "slate";
}

export function applyAccentToDocument(id: AccentId) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (id === "slate") {
    el.removeAttribute("data-accent");
  } else {
    el.dataset.accent = id;
  }
}

export function persistAccent(id: AccentId) {
  try {
    if (id === "slate") {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
    } else {
      localStorage.setItem(ACCENT_STORAGE_KEY, id);
    }
  } catch {
    /* ignore */
  }
  applyAccentToDocument(id);
}
