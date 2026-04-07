import { ProspectSource } from "@prisma/client";
import { normalizeBrazilianPhone } from "./phone-utils";

export interface SerperWebResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerperMapsResult {
  title: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
  cid?: string;
}

export interface NormalizedProspect {
  name: string;
  website: string | null;
  hasWebsite: boolean;
  phone: string | null;
  address: string | null;
  snippet: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  source: ProspectSource;
  position: number | null;
  foundInBothSources: boolean;
}

export function baseDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function mapsUrlFromCid(cid: string | undefined): string | null {
  if (!cid) return null;
  return `https://www.google.com/maps?cid=${encodeURIComponent(cid)}`;
}

/** Máximo de resultados orgânicos por requisição (limite usual Serper/Google). */
export const SERPER_WEB_RESULTS_PER_REQUEST = 100;

export async function searchWeb(
  query: string,
  apiKey: string,
  opts?: { page?: number; num?: number },
): Promise<SerperWebResult[]> {
  const page = opts?.page ?? 1;
  const num = opts?.num ?? SERPER_WEB_RESULTS_PER_REQUEST;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "br",
      hl: "pt-br",
      num,
      page,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Serper web ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string; position?: number }[];
  };
  const organic = data.organic ?? [];
  return organic
    .filter((o) => o.title && o.link)
    .map((o) => ({
      title: o.title!,
      link: o.link!,
      snippet: o.snippet ?? "",
      position: o.position ?? 0,
    }));
}

export async function searchMaps(
  query: string,
  apiKey: string,
): Promise<SerperMapsResult[]> {
  const res = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "br",
      hl: "pt-br",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Serper maps ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    places?: SerperMapsResult[];
  };
  return data.places ?? [];
}

export function normalizeAndDeduplicate(
  webResults: SerperWebResult[],
  mapsResults: SerperMapsResult[],
): { prospects: NormalizedProspect[]; webCount: number; mapsCount: number } {
  const webCount = webResults.length;
  const mapsCount = mapsResults.length;

  const byDomain = new Map<string, NormalizedProspect>();
  const webNoDomain: NormalizedProspect[] = [];

  for (const w of webResults) {
    const domain = baseDomain(w.link);
    const p: NormalizedProspect = {
      name: w.title,
      website: w.link,
      hasWebsite: true,
      phone: null,
      address: null,
      snippet: w.snippet || null,
      rating: null,
      reviewCount: null,
      googleMapsUrl: null,
      source: ProspectSource.GOOGLE_SEARCH,
      position: w.position,
      foundInBothSources: false,
    };
    if (domain) byDomain.set(domain, p);
    else webNoDomain.push(p);
  }

  let mapsOnly: NormalizedProspect[] = [];

  for (const m of mapsResults) {
    const site = m.website?.trim() || null;
    const domain = baseDomain(site);
    const phoneNorm = m.phone ? normalizeBrazilianPhone(m.phone) : null;
    const cidStr =
      m.cid !== undefined && m.cid !== null ? String(m.cid) : undefined;
    const gUrl = mapsUrlFromCid(cidStr);

    if (domain && byDomain.has(domain)) {
      const existing = byDomain.get(domain)!;
      existing.phone = existing.phone || phoneNorm;
      existing.address = existing.address || m.address || null;
      existing.rating = m.rating ?? existing.rating;
      existing.reviewCount = m.reviewCount ?? existing.reviewCount;
      existing.googleMapsUrl = existing.googleMapsUrl || gUrl;
      existing.foundInBothSources = true;
      continue;
    }

    const row: NormalizedProspect = {
      name: m.title,
      website: site,
      hasWebsite: !!site,
      phone: phoneNorm,
      address: m.address || null,
      snippet: null,
      rating: m.rating ?? null,
      reviewCount: m.reviewCount ?? null,
      googleMapsUrl: gUrl,
      source: ProspectSource.GOOGLE_MAPS,
      position: null,
      foundInBothSources: false,
    };

    if (domain) {
      byDomain.set(domain, row);
    } else {
      mapsOnly.push(row);
    }
  }

  const fromMap = [...byDomain.values()];
  const searchFirst = [
    ...webNoDomain.sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
    ...fromMap
      .filter(
        (p) =>
          p.source === ProspectSource.GOOGLE_SEARCH || p.foundInBothSources,
      )
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
  ];
  const mapsOnlySorted = mapsOnly.sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  );
  const mapsPure = fromMap
    .filter((p) => p.source === ProspectSource.GOOGLE_MAPS && !p.foundInBothSources)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  const prospects = [...searchFirst, ...mapsPure, ...mapsOnlySorted];
  return { prospects, webCount, mapsCount };
}
