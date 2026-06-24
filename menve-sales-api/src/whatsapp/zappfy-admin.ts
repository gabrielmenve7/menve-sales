import { ServiceUnavailableException } from "@nestjs/common";
import QRCode from "qrcode";
import {
  extractBase64ImageFromUnknown,
  resolveQrDataUrl,
} from "./evolution-admin";

const DEFAULT_ZAPPFY_BASE_URL = "https://api.zappfy.io";

const ALLOW_GROUPS =
  process.env.WHATSAPP_ALLOW_GROUPS?.trim().toLowerCase() === "true";

/** Filtros «Ignorar mensagens» alinhados ao painel Zappfy (Uazapi/Evolution). */
export function getZappfyExcludeMessages(): string[] {
  const out = ["wasSentByApi"];
  if (!ALLOW_GROUPS) out.push("isGroupYes");
  return out;
}

/** URL pública do webhook Menve; secret na query quando o painel não suporta headers. */
export function buildZappfyMenveWebhookUrl(connectionId: string): string {
  const base = (
    process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    ""
  );
  if (!base) return "";
  const path = `${base}/webhooks/whatsapp/zappfy/${connectionId}`;
  const secret = process.env.ZAPPFY_WEBHOOK_SECRET?.trim();
  if (!secret) return path;
  const u = new URL(path);
  u.searchParams.set("webhook_secret", secret);
  return u.toString();
}

export type ZappfyWebhookFindResult = {
  enabled?: boolean;
  url?: string;
  events?: string[];
};

/** Credenciais globais Zappfy (admintoken nunca expor ao cliente). */
export function getZappfyEnv() {
  const baseUrl = (
    process.env.ZAPPFY_BASE_URL?.trim() || DEFAULT_ZAPPFY_BASE_URL
  ).replace(/\/$/, "");
  const adminToken = process.env.ZAPPFY_ADMIN_TOKEN?.trim();
  if (!adminToken) {
    throw new ServiceUnavailableException(
      "Configure ZAPPFY_ADMIN_TOKEN na API (Railway): admintoken do painel Zappfy. Para instância já criada no painel, use «Vincular com token» em vez de QR.",
    );
  }
  return { baseUrl, adminToken };
}

export function getZappfyBaseUrlForDisplay(): string {
  const u = (
    process.env.ZAPPFY_BASE_URL?.trim() || DEFAULT_ZAPPFY_BASE_URL
  ).replace(/\/$/, "");
  return u || DEFAULT_ZAPPFY_BASE_URL;
}

function zappfyAdminHeaders(adminToken: string) {
  return {
    "Content-Type": "application/json",
    admintoken: adminToken,
  } as const;
}

function zappfyInstanceHeaders(instanceToken: string) {
  return {
    "Content-Type": "application/json",
    token: instanceToken,
  } as const;
}

function zappfyErrorMessage(json: unknown, fallback: string): string {
  const j = json as {
    message?: string | string[];
    error?: string;
    statusCode?: number;
  };
  if (Array.isArray(j.message)) return j.message.join(", ");
  if (typeof j.message === "string") return j.message;
  if (typeof j.error === "string") return j.error;
  return fallback;
}

function pickInstanceToken(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const candidates = [
    o.token,
    o.instanceToken,
    (o.data as Record<string, unknown> | undefined)?.token,
    (o.instance as Record<string, unknown> | undefined)?.token,
    (o.result as Record<string, unknown> | undefined)?.token,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/** POST /instance/init — cria instância e devolve token de instância. */
export async function createZappfyInstance(args: {
  baseUrl: string;
  adminToken: string;
  name?: string;
}) {
  const base = args.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/instance/init`, {
    method: "POST",
    headers: zappfyAdminHeaders(args.adminToken),
    body: JSON.stringify(args.name?.trim() ? { name: args.name.trim() } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(
      zappfyErrorMessage(json, `Zappfy init: HTTP ${res.status}`),
    );
  }
  const token = pickInstanceToken(json);
  if (!token) {
    throw new Error("Zappfy init: resposta sem token de instância");
  }
  return { json, instanceToken: token };
}

/** POST /instance/connect — QR / pareamento. */
export async function connectZappfyInstance(args: {
  baseUrl: string;
  instanceToken: string;
}) {
  const base = args.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/instance/connect`, {
    method: "POST",
    headers: zappfyInstanceHeaders(args.instanceToken),
    body: JSON.stringify({}),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(
      zappfyErrorMessage(json, `Zappfy connect: HTTP ${res.status}`),
    );
  }
  return json;
}

function pickString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

export type ZappfyInstanceInfo = {
  connected: boolean;
  detail?: string;
  webhookUrl?: string;
  instanceKey?: string;
};

/** GET /instance/status (+ campos úteis para diagnóstico). */
export async function fetchZappfyInstanceInfo(args: {
  baseUrl: string;
  instanceToken: string;
}): Promise<ZappfyInstanceInfo> {
  const base = args.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/instance/status`, {
    headers: zappfyInstanceHeaders(args.instanceToken),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      connected: false,
      detail: `HTTP ${res.status}`,
    };
  }

  const statusObj =
    json.status && typeof json.status === "object"
      ? (json.status as Record<string, unknown>)
      : null;
  const instanceObj =
    json.instance && typeof json.instance === "object"
      ? (json.instance as Record<string, unknown>)
      : null;
  const dataObj =
    json.data && typeof json.data === "object"
      ? (json.data as Record<string, unknown>)
      : null;

  const stateRaw =
    json.state ??
    (typeof json.status === "string" ? json.status : null) ??
    instanceObj?.state ??
    instanceObj?.status ??
    statusObj?.state ??
    (typeof statusObj?.status === "string" ? statusObj.status : null) ??
    dataObj?.state ??
    dataObj?.status;

  const state = typeof stateRaw === "string" ? stateRaw.toLowerCase() : "";
  const connectedFlag =
    json.connected ??
    json.isConnected ??
    json.loggedIn ??
    statusObj?.connected ??
    statusObj?.loggedIn;
  const connected =
    connectedFlag === true ||
    state === "open" ||
    state === "connected" ||
    state === "online";

  const webhookUrl = pickString(
    json.webhookUrl,
    json.webhook,
    instanceObj?.webhookUrl,
    instanceObj?.webhook,
    dataObj?.webhookUrl,
    statusObj?.webhookUrl,
  );
  const instanceKey = pickString(
    json.key,
    json.instanceKey,
    instanceObj?.key,
    instanceObj?.instanceKey,
    dataObj?.key,
    dataObj?.instanceKey,
  );

  return {
    connected,
    detail:
      typeof stateRaw === "string"
        ? stateRaw
        : connected
          ? "connected"
          : String(stateRaw ?? statusObj?.connected ?? ""),
    webhookUrl,
    instanceKey,
  };
}

/** GET /instance/status */
export async function fetchZappfyStatus(args: {
  baseUrl: string;
  instanceToken: string;
}) {
  const info = await fetchZappfyInstanceInfo(args);
  return { connected: info.connected, detail: info.detail };
}

/** GET /webhook/find — lê configuração gravada na instância Zappfy. */
export async function fetchZappfyWebhookFind(args: {
  baseUrl: string;
  instanceToken: string;
}): Promise<ZappfyWebhookFindResult | null> {
  const base = args.baseUrl.replace(/\/$/, "");
  const paths = [
    "/webhook/find",
    "/instance/webhook/find",
    "/webhook",
    "/instance/webhook",
  ];
  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: zappfyInstanceHeaders(args.instanceToken),
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const root =
        json.webhook && typeof json.webhook === "object"
          ? (json.webhook as Record<string, unknown>)
          : json;
      const url = pickString(root.url, root.webhookUrl, json.url, json.webhookUrl);
      const eventsRaw = root.events ?? json.events;
      const events = Array.isArray(eventsRaw)
        ? eventsRaw.filter((e): e is string => typeof e === "string")
        : undefined;
      const enabled =
        typeof root.enabled === "boolean"
          ? root.enabled
          : typeof json.enabled === "boolean"
            ? json.enabled
            : undefined;
      if (url || events || enabled !== undefined) {
        return { enabled, url, events };
      }
    } catch {
      // try next path
    }
  }
  return null;
}

const ZAPPFY_WEBHOOK_EVENT_SETS = [
  ["messages"],
  ["messages", "message"],
  ["messages", "message", "messages.upsert", "MESSAGES_UPSERT"],
] as const;

/** Painel Zapfy legado (api.zapfy.me) — só URL, eventos NEW-MESSAGE automáticos. */
export async function setZapfyMeWebhookDelivery(args: {
  instanceKey: string;
  instanceToken: string;
  webhookUrl: string;
}) {
  const key = args.instanceKey.trim();
  const token = args.instanceToken.trim();
  if (!key || !token) return false;

  const bases = [
    process.env.ZAPPFY_LEGACY_BASE_URL?.trim().replace(/\/$/, ""),
    "https://api.zapfy.me/v1",
    "https://api.zapfy.me",
  ].filter((u): u is string => !!u);

  for (const base of bases) {
    const url = `${base}/instance/${encodeURIComponent(key)}/token/${encodeURIComponent(token)}/updateWebhook`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: args.webhookUrl }),
      });
      if (res.ok) return true;
    } catch {
      // try next base
    }
  }
  return false;
}

/** Modo simples: url + events + headers (vários formatos de body). */
export async function setZappfyWebhook(args: {
  baseUrl: string;
  instanceToken: string;
  webhookUrl: string;
  webhookHeaders?: Record<string, string>;
  instanceKey?: string;
}) {
  const base = args.baseUrl.replace(/\/$/, "");
  const headers = args.webhookHeaders;
  const excludeMessages = getZappfyExcludeMessages();
  const bodies: Record<string, unknown>[] = [];

  for (const events of ZAPPFY_WEBHOOK_EVENT_SETS) {
    const core = {
      url: args.webhookUrl,
      events: [...events],
      excludeMessages,
      enabled: true,
      webhookByEvents: false,
      webhookBase64: false,
    };
    if (headers && Object.keys(headers).length > 0) {
      bodies.push({ ...core, headers });
      bodies.push({ ...core, webhookHeaders: headers });
      bodies.push({ webhook: { ...core, headers } });
    } else {
      bodies.push(core);
      bodies.push({ webhook: core });
    }
  }

  const paths = ["/webhook", "/instance/webhook", "/webhook/set", "/instance/webhook/set"];
  const attempts: string[] = [];

  for (const path of paths) {
    for (const body of bodies) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: zappfyInstanceHeaders(args.instanceToken),
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      const text = await res.text().catch(() => "");
      attempts.push(`${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  let instanceKey = args.instanceKey?.trim();
  if (!instanceKey) {
    const info = await fetchZappfyInstanceInfo({
      baseUrl: args.baseUrl,
      instanceToken: args.instanceToken,
    }).catch(() => null);
    instanceKey = info?.instanceKey;
  }
  if (instanceKey) {
    const legacyOk = await setZapfyMeWebhookDelivery({
      instanceKey,
      instanceToken: args.instanceToken,
      webhookUrl: args.webhookUrl,
    });
    if (legacyOk) return;
    attempts.push("zapfy.me updateWebhook falhou");
  }

  throw new Error(
    `Zappfy webhook falhou. ${attempts.slice(0, 6).join(" | ") || "sem detalhe"}`,
  );
}

/** DELETE /instance — ignora 404. */
export async function deleteZappfyInstance(args: {
  baseUrl: string;
  instanceToken: string;
  adminToken?: string;
}) {
  const base = args.baseUrl.replace(/\/$/, "");
  const paths = ["/instance", "/instance/delete"];
  for (const path of paths) {
    const res = await fetch(`${base}${path}`, {
      method: "DELETE",
      headers: args.adminToken
        ? zappfyAdminHeaders(args.adminToken)
        : zappfyInstanceHeaders(args.instanceToken),
    });
    if (res.status === 404) return;
    if (res.ok) return;
  }
}

/** Extrai data URL do QR a partir da resposta de connect. */
export async function getPairingQrFromConnectResponse(
  connectResponse: unknown,
): Promise<string | null> {
  const fromResolve = await resolveQrDataUrl(connectResponse);
  if (fromResolve) return fromResolve;

  const b64 = extractBase64ImageFromUnknown(connectResponse);
  if (b64) return `data:image/png;base64,${b64}`;

  if (!connectResponse || typeof connectResponse !== "object") return null;
  const o = connectResponse as Record<string, unknown>;
  const code =
    (typeof o.code === "string" && o.code.length > 10 ? o.code : null) ??
    (typeof o.pairingCode === "string" && o.pairingCode.length >= 6
      ? o.pairingCode
      : null) ??
    (o.qrcode &&
    typeof o.qrcode === "object" &&
    typeof (o.qrcode as Record<string, unknown>).code === "string"
      ? String((o.qrcode as Record<string, unknown>).code)
      : null);

  if (code && code.length > 10) {
    return QRCode.toDataURL(code, {
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

/** Tenta obter QR após init (connect com retries). */
export async function getZappfyPairingQrDataUrl(args: {
  baseUrl: string;
  instanceToken: string;
  connectResponse?: unknown;
}) {
  if (args.connectResponse !== undefined) {
    const fromConnect = await getPairingQrFromConnectResponse(
      args.connectResponse,
    );
    if (fromConnect) return fromConnect;
  }

  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    const connectJson = await connectZappfyInstance({
      baseUrl: args.baseUrl,
      instanceToken: args.instanceToken,
    });
    const qr = await getPairingQrFromConnectResponse(connectJson);
    if (qr) return qr;
    if (i < maxAttempts - 1) await sleep(750);
  }
  return null;
}
