import * as cheerio from "cheerio";
import { normalizeBrazilianPhone } from "./phone-utils";

export interface ScrapedData {
  whatsapp: string | null;
  phones: string[];
  emails: string[];
  social: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
  };
  metaDescription: string | null;
  hasContactForm: boolean;
}

const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD_EMAIL_SUFFIX = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

function uniqNormPhones(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const n = normalizeBrazilianPhone(r);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function extractWaFromHref(href: string): string | null {
  const h = href.toLowerCase();
  if (h.includes("wa.me/")) {
    const m = href.match(/wa\.me\/\+?(\d{10,15})/i);
    if (m?.[1]) return normalizeBrazilianPhone(m[1]);
  }
  if (h.includes("api.whatsapp.com")) {
    try {
      const u = new URL(href, "https://wa.me");
      const p = u.searchParams.get("phone");
      if (p) return normalizeBrazilianPhone(p);
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const empty: ScrapedData = {
    whatsapp: null,
    phones: [],
    emails: [],
    social: {},
    metaDescription: null,
    hasContactForm: false,
  };

  let absolute = url.trim();
  if (!absolute.startsWith("http")) absolute = `https://${absolute}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(absolute, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    clearTimeout(t);
    return empty;
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) return empty;
  const html = await res.text();
  const $ = cheerio.load(html);

  const phonesRaw: string[] = [];
  const emailsRaw: string[] = [];

  $('a[href*="wa.me"], a[href*="whatsapp.com"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const w = extractWaFromHref(href);
    if (w) phonesRaw.push(w.replace(/^\+/, ""));
  });

  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const num = href.replace(/^tel:/i, "").trim();
    if (num) phonesRaw.push(num);
  });

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const e = href.replace(/^mailto:/i, "").split("?")[0]?.trim();
    if (e) emailsRaw.push(e);
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).text());
      const stack = Array.isArray(j) ? j : [j];
      for (const item of stack) {
        if (!item || typeof item !== "object") continue;
        const tel = (item as { telephone?: string }).telephone;
        if (tel) phonesRaw.push(tel);
        const em = (item as { email?: string }).email;
        if (typeof em === "string") emailsRaw.push(em);
      }
    } catch {
      /* ignore */
    }
  });

  const desc =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    null;

  let hasForm = false;
  $("form").each((_, f) => {
    const $f = $(f);
    if (
      $f.find('input[type="email"]').length ||
      $f.find('input[name*="phone" i]').length ||
      $f.find("textarea").length
    ) {
      hasForm = true;
      return false;
    }
    return undefined;
  });

  const social: ScrapedData["social"] = {};
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    if (href.includes("instagram.com/") && !href.includes("/p/"))
      social.instagram = $(el).attr("href") ?? undefined;
    if (
      href.includes("facebook.com/") &&
      !href.includes("/sharer") &&
      !href.includes("/share.php")
    )
      social.facebook = $(el).attr("href") ?? undefined;
    if (href.includes("linkedin.com/company/") || href.includes("linkedin.com/in/"))
      social.linkedin = $(el).attr("href") ?? undefined;
  });

  const bodyText = $("body").text();
  let m: RegExpExecArray | null;
  const brPhone = /\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/g;
  while ((m = brPhone.exec(bodyText)) !== null) {
    phonesRaw.push(m[0]);
  }

  while ((m = EMAIL_RE.exec(html)) !== null) {
    const e = m[0];
    if (!BAD_EMAIL_SUFFIX.test(e) && !e.includes("@2x.")) emailsRaw.push(e);
  }

  const phones = uniqNormPhones(phonesRaw);
  const emails = [...new Set(emailsRaw.map((e) => e.toLowerCase()))];

  let whatsapp: string | null = null;
  for (const p of phones) {
    if (p.length >= 14 && p[4] === "9") {
      whatsapp = p;
      break;
    }
  }
  if (!whatsapp && phones.length > 0) whatsapp = phones[0] ?? null;

  return {
    whatsapp,
    phones,
    emails,
    social,
    metaDescription: desc?.trim() || null,
    hasContactForm: hasForm,
  };
}
