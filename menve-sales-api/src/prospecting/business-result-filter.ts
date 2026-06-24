import type { MapsPlaceResult, WebSearchResult } from "./prospect-normalize";

/**
 * Domínios que raramente representam uma empresa-alvo de prospecção
 * (notícias, vídeo, redes sociais, marketplaces, enciclopédias).
 * Comparação por sufixo de hostname (ex.: g1.globo.com → globo.com).
 */
const BLOCKED_HOST_SUFFIXES: string[] = [
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "kwai.com",
  "pinterest.com",
  "reddit.com",
  "wikipedia.org",
  "wikimedia.org",
  "globo.com",
  "uol.com.br",
  "terra.com.br",
  "r7.com",
  "msn.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "nytimes.com",
  "estadao.com.br",
  "folha.uol.com.br",
  "em.com.br",
  "correiobraziliense.com.br",
  "otempo.com.br",
  "gazetadopovo.com.br",
  "amazon.com.br",
  "amazon.com",
  "mercadolivre.com.br",
  "mercadolivre.com",
  "shopee.com.br",
  "aliexpress.com",
  "olx.com.br",
  "zoom.com.br",
  "canva.com",
];

/** Caminhos típicos de vídeo/notícia — páginas que não são “ficha” de empresa. */
const BLOCKED_PATH_REGEX: RegExp[] = [
  /\/videos?\//i,
  /\/video\//i,
  /\/v\/\d+/i,
  /\/noticias?\//i,
  /\/noticia\//i,
  /\/news\//i,
  /\/article\//i,
  /\/articles\//i,
  /\/story\//i,
  /\/stories\//i,
  /\/tag\//i,
  /\/category\//i,
];

/** Título ou snippet com forte cheiro de notícia judicial / mídia (PT-BR). */
const JUNK_TEXT_REGEX: RegExp[] = [
  /foi (preso|presa|condenado|condenada|julgado|absolvido)/i,
  /é (preso|presa|investigado|investigada)/i,
  /tentativa de homic[ií]dio/i,
  /qualificador(es)? de motivo fútil/i,
  /espancou (mulher|homem|esposa|marido)/i,
  /na sa[ií]da de bar/i,
  /seu navegador não suporta/i,
  /your browser can'?t play/i,
  /learn more\.{3}/i,
  /\bgloboplay\b/i,
  /\bg1\b.*\bnotícia/i,
];

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

function hostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase();
  for (const suf of BLOCKED_HOST_SUFFIXES) {
    if (hostMatchesSuffix(h, suf)) return true;
  }
  return false;
}

function linkedInBlocked(url: URL): boolean {
  const h = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!hostMatchesSuffix(h, "linkedin.com")) return false;
  const p = url.pathname.toLowerCase();
  return !p.includes("/company/");
}

function pathBlocked(pathname: string): boolean {
  const p = pathname.toLowerCase();
  for (const re of BLOCKED_PATH_REGEX) {
    if (re.test(p)) return true;
  }
  return false;
}

function textLooksLikeNewsOrMedia(title: string, snippet: string): boolean {
  const t = `${title}\n${snippet}`;
  for (const re of JUNK_TEXT_REGEX) {
    if (re.test(t)) return true;
  }
  return false;
}

/** URL aponta para algo que tratamos como não-empresa. */
export function isBusinessLikeUrl(rawUrl: string): boolean {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return false;
  let u: URL;
  try {
    u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (hostnameBlocked(host)) return false;
  if (linkedInBlocked(u)) return false;
  if (pathBlocked(u.pathname)) return false;
  return true;
}

/** Resultado orgânico da busca web: manter só candidatos a empresa. */
export function isBusinessLikeWebResult(r: WebSearchResult): boolean {
  if (!isBusinessLikeUrl(r.link)) return false;
  if (textLooksLikeNewsOrMedia(r.title, r.snippet)) return false;
  return true;
}

export function filterBusinessWebResults(
  results: WebSearchResult[],
): WebSearchResult[] {
  return results.filter(isBusinessLikeWebResult);
}

/** Remove site do Maps se for portal/redes — mantém o lugar (endereço/telefone). */
export function sanitizeMapsResult(m: MapsPlaceResult): MapsPlaceResult {
  const w = m.website?.trim();
  if (!w) return m;
  if (isBusinessLikeUrl(w)) return m;
  return { ...m, website: undefined };
}

export function sanitizeMapsResults(
  places: MapsPlaceResult[],
): MapsPlaceResult[] {
  return places.map(sanitizeMapsResult);
}
