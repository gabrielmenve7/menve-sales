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
