import { ServiceUnavailableException } from "@nestjs/common";
import QRCode from "qrcode";

/** Credenciais globais da Evolution (nunca expor ao cliente). */
export function getEvolutionEnv() {
  const baseUrl = process.env.EVOLUTION_BASE_URL?.trim();
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new ServiceUnavailableException(
      "Configure EVOLUTION_BASE_URL e EVOLUTION_API_KEY no ambiente.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

function evolutionHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
  } as const;
}

/** `false` reduz tamanho do POST (sem mídia em base64); útil se o servidor Evolution falha em webhooks grandes. Padrão: true. */
export function evolutionWebhookBase64(): boolean {
  const v = process.env.EVOLUTION_WEBHOOK_BASE64?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return true;
}

function evolutionErrorMessage(json: unknown, fallback: string): string {
  const j = json as {
    response?: { message?: string[] | string };
    message?: string | string[];
    error?: string;
    statusCode?: number;
  };
  const m = j.response?.message;
  if (Array.isArray(m)) return m.join(", ");
  if (typeof m === "string") return m;
  if (Array.isArray(j.message)) return j.message.join(", ");
  if (typeof j.message === "string") return j.message;
  if (typeof j.error === "string") return j.error;
  return fallback;
}

function formatWebhookSetFailure(
  attempts: { label: string; status: number; body: string }[],
): string {
  const parts = attempts.map(
    (a) => `${a.label} HTTP ${a.status}: ${a.body.slice(0, 400)}`,
  );
  return parts.join(" | ");
}

/**
 * Valores permitidos pelo `webhook.schema` da Evolution (enum = EventController.events).
 * Não enviar `messages.upsert` etc.: o schema JSON rejeita e o POST /webhook/set falha.
 * O emit da Evolution normaliza `messages.upsert` → `MESSAGES_UPSERT` ao comparar com essa lista.
 */
const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
] as const;

export type CreateInstanceInput = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  webhookHeaders?: Record<string, string>;
};

/** POST /instance/create — webhook com URL do Menve incluindo connectionId. */
export async function createEvolutionInstance(input: CreateInstanceInput) {
  const body = {
    instanceName: input.instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    webhook: {
      enabled: true,
      url: input.webhookUrl,
      // Com true, a Evolution posta em .../messages-upsert etc.; nosso handler é uma URL única.
      byEvents: false,
      base64: evolutionWebhookBase64(),
      events: [...WEBHOOK_EVENTS],
      ...(Object.keys(input.webhookHeaders ?? {}).length > 0
        ? { headers: input.webhookHeaders }
        : {}),
    },
  };

  const res = await fetch(`${input.baseUrl}/instance/create`, {
    method: "POST",
    headers: evolutionHeaders(input.apiKey),
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as unknown;
  if (res.status === 201 || res.ok) return json;

  throw new Error(
    evolutionErrorMessage(json, `Evolution: HTTP ${res.status}`),
  );
}

/** POST /webhook/set/{instance} — alinha URL única (webhookByEvents: false) em instâncias antigas. */
export async function setEvolutionInstanceWebhook(input: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  webhookHeaders?: Record<string, string>;
}) {
  const base = input.baseUrl.replace(/\/$/, "");
  const path = `/webhook/set/${encodeURIComponent(input.instanceName)}`;
  const headers = evolutionHeaders(input.apiKey);

  // EventDto / WebhookController.set — exige objeto `webhook` com `enabled` (ver evolution-api event.dto + webhook.controller).
  const nestedBody = {
    webhook: {
      enabled: true,
      url: input.webhookUrl,
      byEvents: false,
      base64: evolutionWebhookBase64(),
      events: [...WEBHOOK_EVENTS],
      ...(Object.keys(input.webhookHeaders ?? {}).length > 0
        ? { headers: input.webhookHeaders }
        : {}),
    },
  };

  // OpenAPI v2 (corpo plano) — alguns proxies documentam assim; não misturar com o fallback abaixo se o servidor usa EventDto.
  const flatBody: Record<string, unknown> = {
    enabled: true,
    url: input.webhookUrl,
    webhookByEvents: false,
    webhookBase64: evolutionWebhookBase64(),
    events: [...WEBHOOK_EVENTS],
  };
  if (input.webhookHeaders && Object.keys(input.webhookHeaders).length > 0) {
    flatBody.headers = input.webhookHeaders;
  }

  // Doc v2 (curl) usa corpo plano; o código-fonte oficial valida `{ webhook: {...} }`.
  // Tentamos os dois e devolvemos os dois erros se ambos falharem.
  const attempts: { label: string; status: number; body: string }[] = [];

  const tryPost = async (label: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (r.ok) return { ok: true as const };
    attempts.push({ label, status: r.status, body: text });
    return { ok: false as const };
  };

  if ((await tryPost("flat (OpenAPI v2)", flatBody)).ok) return;
  if ((await tryPost("nested (EventDto)", nestedBody)).ok) return;

  const lastJson = (() => {
    try {
      return JSON.parse(attempts[attempts.length - 1]?.body ?? "{}") as unknown;
    } catch {
      return {};
    }
  })();

  throw new Error(
    evolutionErrorMessage(
      lastJson,
      `Evolution webhook/set falhou. ${formatWebhookSetFailure(attempts)}`,
    ),
  );
}

/** DELETE /instance/delete/{instance} — ignora 404. */
export async function deleteEvolutionInstance(args: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}) {
  const res = await fetch(
    `${args.baseUrl}/instance/delete/${encodeURIComponent(args.instanceName)}`,
    {
      method: "DELETE",
      headers: { apikey: args.apiKey },
    },
  );
  if (res.status === 404) return;
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as unknown;
    throw new Error(
      evolutionErrorMessage(json, `Evolution delete: HTTP ${res.status}`),
    );
  }
}

/** GET /instance/connect/{instance} — QR / pareamento. */
export async function fetchEvolutionConnect(args: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}) {
  const res = await fetch(
    `${args.baseUrl}/instance/connect/${encodeURIComponent(args.instanceName)}`,
    { headers: { apikey: args.apiKey } },
  );
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(
      evolutionErrorMessage(json, `Evolution connect: HTTP ${res.status}`),
    );
  }
  return json;
}

/** GET /instance/connectionState/{instance} */
export async function fetchEvolutionConnectionState(args: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}) {
  const res = await fetch(
    `${args.baseUrl}/instance/connectionState/${encodeURIComponent(args.instanceName)}`,
    { headers: { apikey: args.apiKey } },
  );
  const json = (await res.json().catch(() => ({}))) as {
    instance?: { state?: string };
  };
  if (!res.ok) {
    return {
      connected: false,
      detail: `HTTP ${res.status}`,
    };
  }
  const state = json.instance?.state;
  return {
    connected: state === "open",
    detail: state,
  };
}

function isLikelyImageBase64(s: string) {
  const t = s.trim();
  if (t.startsWith("data:image")) return true;
  return t.length > 80 && /^[A-Za-z0-9+/=\r\n]+$/.test(t.slice(0, 120));
}

/** Extrai string base64 de respostas da Evolution (create/connect/event). */
export function extractBase64ImageFromUnknown(payload: unknown): string | null {
  const visit = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") {
      if (isLikelyImageBase64(v)) {
        const x = v.trim();
        if (x.startsWith("data:image")) {
          const comma = x.indexOf(",");
          return comma >= 0 ? x.slice(comma + 1) : null;
        }
        return x.replace(/\s/g, "");
      }
      return null;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const r = visit(item);
        if (r) return r;
      }
      return null;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const key of ["base64", "qrcode", "code"]) {
        if (key in o) {
          const r = visit(o[key]);
          if (r) return r;
        }
      }
      for (const val of Object.values(o)) {
        const r = visit(val);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(payload);
}

/** Converte resposta Evolution + create em data URL exibível no <img>. */
export async function resolveQrDataUrl(
  payload: unknown,
): Promise<string | null> {
  const b64 = extractBase64ImageFromUnknown(payload);
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }

  const p = payload as Record<string, unknown>;
  const qr = p.qrcode as Record<string, unknown> | undefined;
  const nestedCode =
    qr && typeof qr.code === "string" ? qr.code : null;
  const code =
    (typeof p.code === "string" && p.code.length > 20 ? p.code : null) ??
    nestedCode;

  if (code && code.length > 10) {
    return QRCode.toDataURL(code, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  }

  const pairing = typeof p.pairingCode === "string" ? p.pairingCode : null;
  if (pairing && pairing.length >= 6) {
    return QRCode.toDataURL(pairing, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  }

  return null;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Tenta obter QR após create ou refresh (connect). */
export async function getPairingQrDataUrl(args: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  createResponse?: unknown;
}) {
  if (args.createResponse !== undefined) {
    const fromCreate = await resolveQrDataUrl(args.createResponse);
    if (fromCreate) return fromCreate;
  }
  /** Evolution v2 às vezes responde `{ count: 0 }` até o socket estabilizar; retries curtos evitam “Sem QR”. */
  const maxAttempts = 12;
  for (let i = 0; i < maxAttempts; i++) {
    const connectJson = await fetchEvolutionConnect({
      baseUrl: args.baseUrl,
      apiKey: args.apiKey,
      instanceName: args.instanceName,
    });
    const qr = await resolveQrDataUrl(connectJson);
    if (qr) return qr;
    if (i < maxAttempts - 1) await sleep(750);
  }
  return null;
}
