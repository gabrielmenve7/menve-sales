/**
 * Normalização de telefone para busca (extensão WhatsApp Web / inbox).
 * Compara pelo número discável (apenas dígitos), pois o CRM pode armazenar
 * "+55 …", "(11) …" ou dígitos colados.
 */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Mesma ideia do pipeline de WhatsApp: E.164 simplificado quando há dígitos suficientes. */
export function normalizePhoneDisplay(raw: string): string {
  const digits = phoneDigitsOnly(raw);
  if (digits.length >= 10) return `+${digits}`;
  return raw.trim();
}

/**
 * Variações para comparar WhatsApp (ex.: 5511987654321) com CRM que pode ter
 * só DDD+número (11987654321) ou com +55 completo.
 */
export function phoneMatchCandidates(digitsRaw: string): string[] {
  const d = phoneDigitsOnly(digitsRaw);
  const ordered: string[] = [];
  const push = (x: string) => {
    if (x.length >= 8 && !ordered.includes(x)) ordered.push(x);
  };
  push(d);
  if (d.startsWith("55") && d.length >= 12) {
    push(d.slice(2));
  }
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) {
    push(`55${d}`);
  }
  return ordered;
}
