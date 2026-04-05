/** Dígitos nacionais (DDD + 8 ou 9), no máx. 11. */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Extrai até 11 dígitos nacionais a partir do valor armazenado (+55…, só dígitos ou já mascarado).
 */
export function nationalDigitsFromStored(stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  let d = digitsOnly(stored);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

/**
 * Máscara (00) 0000-0000 ou (00) 00000-0000 conforme o usuário digita.
 */
export function formatBrazilPhoneInput(nationalDigits: string): string {
  const d = nationalDigits.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Dígitos nacionais a partir do texto atual do input (aceita colar +55…). */
export function nationalDigitsFromInput(value: string): string {
  let d = digitsOnly(value);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

/** Gravação canônica para API (alinhado a números BR no seed: +55…). */
export function storedPhoneFromNational(national: string): string | null {
  const d = national.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}
