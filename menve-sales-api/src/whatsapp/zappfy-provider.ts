import { fetchZappfyStatus } from "./zappfy-admin";
import type {
  IWhatsAppProvider,
  NormalizedInbound,
  SendOutboundMediaInput,
} from "./provider.interface";

type ZappfyConfig = {
  baseUrl: string;
  instanceToken: string;
};

const ALLOW_GROUPS =
  process.env.WHATSAPP_ALLOW_GROUPS?.trim().toLowerCase() === "true";

export class ZappfyWhatsAppProvider implements IWhatsAppProvider {
  constructor(private readonly config: ZappfyConfig) {}

  private base() {
    return this.config.baseUrl.replace(/\/$/, "");
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      token: this.config.instanceToken,
    };
  }

  async sendTextMessage(to: string, text: string) {
    try {
      const url = `${this.base()}/send/text`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          number: to.replace(/\D/g, ""),
          text,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        messageId?: string;
        key?: { id?: string };
        data?: { id?: string; messageId?: string };
      };
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const externalId =
        json.id ??
        json.messageId ??
        json.key?.id ??
        json.data?.id ??
        json.data?.messageId;
      return { ok: true, externalId: externalId ? String(externalId) : undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  async sendOutboundMedia(input: SendOutboundMediaInput) {
    const number = input.to.replace(/\D/g, "");
    const media =
      input.base64.trim().startsWith("data:") ||
      input.base64.includes(";base64,")
        ? input.base64.trim()
        : `data:${input.mimeType};base64,${input.base64.trim()}`;

    const mediatype =
      input.kind === "audio" ? "audio" : input.kind === "image" ? "image" : "document";
    const fileName =
      input.fileName?.trim() ||
      (input.kind === "image" ? "image.jpg" : "documento.pdf");

    try {
      const url = `${this.base()}/send/media`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          number,
          mediatype,
          mimetype: input.mimeType,
          caption: input.caption?.trim() ?? "",
          media,
          fileName,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        messageId?: string;
        key?: { id?: string };
      };
      if (!res.ok) {
        return {
          ok: false,
          error: `Zappfy media HTTP ${res.status}: ${JSON.stringify(json)}`,
        };
      }
      const externalId = json.id ?? json.messageId ?? json.key?.id;
      return { ok: true, externalId: externalId ? String(externalId) : undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  async getConnectionStatus() {
    return fetchZappfyStatus({
      baseUrl: this.config.baseUrl,
      instanceToken: this.config.instanceToken,
    });
  }

  parseWebhook(payload: unknown): NormalizedInbound[] {
    const blobs = extractZappfyMessageBlobs(payload);
    const out: NormalizedInbound[] = [];
    for (const data of blobs) {
      const parsed = parseOneZappfyMessage(data);
      if (parsed) out.push(parsed);
    }
    return out;
  }
}

function zappfyEventIsMessages(payload: Record<string, unknown>): boolean {
  const ev = payload.event ?? payload.type ?? payload.action;
  if (ev == null) return true;
  if (typeof ev !== "string") return true;
  const n = ev.trim().replace(/[.-]/g, "_").toUpperCase();
  return n === "MESSAGES" || n === "MESSAGE" || n === "NEW_MESSAGE";
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractZappfyMessageBlobs(payload: unknown): Record<string, unknown>[] {
  let p = payload as Record<string, unknown>;

  const bodyRaw = p.body;
  if (typeof bodyRaw === "string") {
    const parsed = tryParseJsonObject(bodyRaw.trim());
    if (parsed && (parsed.data != null || parsed.event != null)) {
      p = parsed;
    }
  } else if (bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw)) {
    const b = bodyRaw as Record<string, unknown>;
    if (b.data != null || b.event != null) p = b;
  }

  if (!zappfyEventIsMessages(p)) return [];

  let d: unknown = p.data ?? p.message ?? p.payload;
  if (typeof d === "string") {
    const parsed = tryParseJsonObject(d.trim());
    d = parsed ?? d;
  }

  if (Array.isArray(d)) {
    return d.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }

  if (d && typeof d === "object") {
    const inner = d as Record<string, unknown>;
    if (inner.messages != null) {
      const msgs = Array.isArray(inner.messages)
        ? inner.messages
        : Object.values(inner.messages);
      const fromMessages = msgs.filter(
        (x) => x && typeof x === "object",
      ) as Record<string, unknown>[];
      if (fromMessages.length > 0) return fromMessages;
    }
    return [inner];
  }

  if (p.text != null || p.body != null || p.from != null || p.chatId != null) {
    return [p];
  }

  return [];
}

export function getZappfyWebhookParseMeta(payload: unknown): {
  event: unknown;
  blobCount: number;
} {
  const p = payload as Record<string, unknown>;
  return {
    event: p.event ?? p.type,
    blobCount: extractZappfyMessageBlobs(payload).length,
  };
}

function parseTimestamp(raw: unknown): Date {
  const n = Number(raw);
  if (!Number.isFinite(n)) return new Date();
  if (n > 0 && n < 1e12) return new Date(n * 1000);
  return new Date(n);
}

function digitsFromJidOrPhone(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.includes("@")) return s.split("@")[0]?.replace(/\D/g, "") ?? "";
  return s.replace(/\D/g, "");
}

function parseOneZappfyMessage(data: Record<string, unknown>): NormalizedInbound | null {
  const key = data.key as Record<string, unknown> | undefined;
  const remoteJid = String(
    key?.remoteJid ?? data.chatId ?? data.from ?? data.remoteJid ?? "",
  );
  const fromDigits =
    digitsFromJidOrPhone(data.from) ||
    digitsFromJidOrPhone(data.chatId) ||
    digitsFromJidOrPhone(remoteJid);

  if (!fromDigits && !remoteJid.endsWith("@lid")) return null;
  if (remoteJid.includes("status@broadcast")) return null;

  const isGroupLike =
    remoteJid.includes("@g.us") ||
    String(key?.participant ?? "").includes("@g.us");
  if (isGroupLike && !ALLOW_GROUPS) return null;

  const from = remoteJid.endsWith("@lid")
    ? `lid:${remoteJid.split("@")[0] ?? ""}`
    : fromDigits;
  if (!from) return null;

  const textRaw =
    data.text ??
    data.body ??
    data.messageText ??
    (data.message && typeof data.message === "object"
      ? extractTextFromProto(data.message as Record<string, unknown>)
      : undefined);
  const text = typeof textRaw === "string" ? textRaw.trim() : "";
  if (!text) return null;

  const externalId = String(
    data.messageId ??
      data.id ??
      key?.id ??
      `${from}-${Date.now()}`,
  );
  const fromMe = data.fromMe === true || key?.fromMe === true;

  return {
    externalId,
    whatsappKeyId: key?.id ? String(key.id) : undefined,
    from,
    body: text,
    timestamp: parseTimestamp(data.timestamp ?? data.messageTimestamp),
    profileName:
      typeof data.pushName === "string"
        ? data.pushName
        : typeof data.profileName === "string"
          ? data.profileName
          : undefined,
    fromMe,
    debug: {
      remoteJid: remoteJid || undefined,
      participant: key?.participant ? String(key.participant) : undefined,
    },
  };
}

function extractTextFromProto(message: Record<string, unknown>): string {
  const candidates: unknown[] = [
    message.conversation,
    (message.extendedTextMessage as Record<string, unknown> | undefined)?.text,
    (message.imageMessage as Record<string, unknown> | undefined)?.caption,
    (message.videoMessage as Record<string, unknown> | undefined)?.caption,
    (message.documentMessage as Record<string, unknown> | undefined)?.caption,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}
