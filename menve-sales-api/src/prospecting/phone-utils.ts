/** Normalize Brazilian phone to +55DDNNNNNNNNN (mobile or landline). */
export function normalizeBrazilianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  let n = digits;
  if (n.startsWith("55") && n.length >= 12) {
    n = n.slice(2);
  }
  if (n.length < 10 || n.length > 11) return null;
  const ddd = parseInt(n.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return null;
  return `+55${n}`;
}

/**
 * Tenta várias strings (WA, Maps, scrape) e devolve um único E.164 BR ou null.
 */
export function resolveBrazilianPhoneFromCandidates(
  candidates: (string | null | undefined)[],
): string | null {
  const seen = new Set<string>();
  const rawList: string[] = [];
  for (const c of candidates) {
    const t = c?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    rawList.push(t);
  }
  for (const raw of rawList) {
    const n = normalizeBrazilianPhone(raw);
    if (n) return n;
  }
  for (const raw of rawList) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10) continue;
    const n = normalizeBrazilianPhone(digits);
    if (n) return n;
  }
  return null;
}

export function isMobilePhone(normalized: string): boolean {
  const n = normalized.replace(/\D/g, "");
  if (n.length < 12) return false;
  return n[4] === "9";
}

export function isLikelyWhatsApp(normalized: string): boolean {
  return isMobilePhone(normalized);
}

export function extractDDD(normalized: string): string | null {
  const n = normalized.replace(/\D/g, "");
  if (n.startsWith("55") && n.length >= 12) return n.slice(2, 4);
  return null;
}
