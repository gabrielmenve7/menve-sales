import type { Contact } from "@prisma/client";

export function getContactPhotoUrl(contact: Contact): string | null {
  const cd =
    contact.customData && typeof contact.customData === "object"
      ? (contact.customData as Record<string, unknown>)
      : null;
  const raw = cd?.whatsappProfilePhotoUrl;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** Iniciais para avatar: duas palavras → letra de cada; uma palavra → duas primeiras letras (ex.: Sara → SA). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0]!;
    if (w.length <= 1) return w.toUpperCase();
    return w.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

export function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
