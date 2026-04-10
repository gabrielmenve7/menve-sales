/** Gera chave API-safe a partir do nome exibido (letras, números, _). */
export function slugifyCustomFieldKey(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (s.length > 0) return s;
  return `campo_${Date.now().toString(36)}`;
}
