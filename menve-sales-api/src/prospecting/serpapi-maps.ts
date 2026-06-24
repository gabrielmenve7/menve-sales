import { baseDomain } from "./prospect-normalize";
import type { MapsPlaceResult } from "./prospect-normalize";
import { brazilLocationLabel } from "./brazil-states";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const RESULTS_PER_PAGE = 20;
const MAX_START_OFFSET = 100;
const REQUEST_TIMEOUT_MS = 30_000;

type SerpApiLocalResult = {
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  type?: string;
  data_cid?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
};

type SerpApiMapsResponse = {
  search_metadata?: { status?: string };
  error?: string;
  local_results?: SerpApiLocalResult[];
};

export function defaultMapsMaxPages(): number {
  const raw = process.env.SERPAPI_MAPS_MAX_PAGES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 3;
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(n, 6);
}

function normalizeAddressKey(title: string, address: string): string {
  return `${title.trim().toLowerCase()}|${address.trim().toLowerCase()}`;
}

export function mapSerpApiLocalResult(r: SerpApiLocalResult): MapsPlaceResult | null {
  const title = r.title?.trim();
  if (!title) return null;
  const cid =
    r.data_cid !== undefined && r.data_cid !== null
      ? String(r.data_cid)
      : undefined;
  return {
    title,
    address: r.address?.trim() || "",
    phone: r.phone?.trim() || undefined,
    website: r.website?.trim() || undefined,
    rating: typeof r.rating === "number" ? r.rating : undefined,
    reviewCount: typeof r.reviews === "number" ? r.reviews : undefined,
    category: r.type?.trim() || null,
    cid,
    latitude: r.gps_coordinates?.latitude,
    longitude: r.gps_coordinates?.longitude,
  };
}

function dedupePlaces(places: MapsPlaceResult[]): MapsPlaceResult[] {
  const seenCid = new Set<string>();
  const seenDomain = new Set<string>();
  const seenNameAddr = new Set<string>();
  const out: MapsPlaceResult[] = [];

  for (const p of places) {
    if (p.cid) {
      if (seenCid.has(p.cid)) continue;
      seenCid.add(p.cid);
    } else {
      const domain = baseDomain(p.website);
      if (domain) {
        if (seenDomain.has(domain)) continue;
        seenDomain.add(domain);
      } else if (p.address) {
        const key = normalizeAddressKey(p.title, p.address);
        if (seenNameAddr.has(key)) continue;
        seenNameAddr.add(key);
      }
    }
    out.push(p);
  }
  return out;
}

export async function fetchSerpApiMapsPage(
  query: string,
  apiKey: string,
  opts: {
    start: number;
    city?: string | null;
    state?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<MapsPlaceResult[]> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q: query,
    google_domain: "google.com.br",
    gl: "br",
    hl: "pt-br",
    start: String(opts.start),
    api_key: apiKey,
  });

  if (opts.city?.trim() && opts.state?.trim()) {
    params.set("location", brazilLocationLabel(opts.city, opts.state));
    params.set("z", "12");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchFn(`${SERPAPI_BASE}?${params.toString()}`, {
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`SerpApi maps ${res.status}: ${text.slice(0, 500)}`);
    }

    let data: SerpApiMapsResponse;
    try {
      data = JSON.parse(text) as SerpApiMapsResponse;
    } catch {
      throw new Error("SerpApi maps: resposta JSON inválida");
    }

    if (data.search_metadata?.status === "Error" || data.error) {
      throw new Error(data.error ?? "SerpApi maps: busca retornou erro");
    }

    const raw = data.local_results ?? [];
    return raw
      .map(mapSerpApiLocalResult)
      .filter((p): p is MapsPlaceResult => p != null);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("SerpApi maps: timeout na requisição");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchMapsAllPages(
  query: string,
  opts: { city?: string | null; state?: string | null; maxPages?: number },
  apiKey: string,
  fetchImpl?: typeof fetch,
): Promise<MapsPlaceResult[]> {
  const maxPages = opts.maxPages ?? defaultMapsMaxPages();
  const all: MapsPlaceResult[] = [];

  for (let page = 0; page < maxPages; page++) {
    const start = page * RESULTS_PER_PAGE;
    if (start > MAX_START_OFFSET) break;

    const batch = await fetchSerpApiMapsPage(query, apiKey, {
      start,
      city: opts.city,
      state: opts.state,
      fetchImpl,
    });

    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < RESULTS_PER_PAGE) break;

    if (page < maxPages - 1 && start + RESULTS_PER_PAGE <= MAX_START_OFFSET) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return dedupePlaces(all);
}
