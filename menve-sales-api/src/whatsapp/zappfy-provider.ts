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

  async fetchInboundMediaBase64(args: { keyId: string; remoteJid: string }) {
    const body = JSON.stringify({
      message: {
        key: {
          id: args.keyId,
          remoteJid: args.remoteJid,
        },
      },
      convertToMp4: false,
    });
    const paths = [
      "/chat/getBase64FromMediaMessage",
      "/message/getBase64FromMediaMessage",
    ];
    for (const path of paths) {
      try {
        const res = await fetch(`${this.base()}${path}`, {
          method: "POST",
          headers: this.headers(),
          body,
        });
        if (!res.ok) continue;
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const pick = (v: unknown): string | undefined =>
          typeof v === "string" && v.trim() ? v.trim() : undefined;
        const b64 =
          pick(json.base64) ||
          (json.data && typeof json.data === "object"
            ? pick((json.data as Record<string, unknown>).base64)
            : undefined);
        if (!b64) continue;
        const mimetype =
          pick(json.mimetype) ||
          (json.data && typeof json.data === "object"
            ? pick((json.data as Record<string, unknown>).mimetype as string)
            : undefined);
        return { base64: b64, mimetype };
      } catch {
        // try next path
      }
    }
    return null;
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
  if (n === "MESSAGE_UPDATED" || n === "MESSAGES_UPDATE") return false;
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
    if (parsed && (parsed.data != null || parsed.event != null || parsed.type != null)) {
      p = parsed;
    }
  } else if (bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw)) {
    const b = bodyRaw as Record<string, unknown>;
    if (b.data != null || b.event != null || b.type != null) p = b;
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

/** Campos úteis para log/diagnóstico sem serializar o body inteiro. */
export function getZappfyWebhookInboxSample(payload: unknown): {
  event: unknown;
  hasDataKey: boolean;
  fromMe: unknown;
  remoteJid: string | null;
} {
  const p = payload as Record<string, unknown>;
  const event = p.event ?? p.type ?? p.action;
  let data: Record<string, unknown> | null = null;
  const d = p.data ?? p.message ?? p.payload;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    data = d as Record<string, unknown>;
  } else if (Array.isArray(d) && d[0] && typeof d[0] === "object") {
    data = d[0] as Record<string, unknown>;
  }
  const key = data?.key as Record<string, unknown> | undefined;
  const hasDataKey = !!(key && typeof key === "object");
  const fromMe = key?.fromMe ?? data?.fromMe ?? p.fromMe;
  const remoteJid =
    typeof key?.remoteJid === "string"
      ? key.remoteJid
      : typeof data?.remoteJid === "string"
        ? data.remoteJid
        : typeof data?.chatId === "string"
          ? data.chatId
          : typeof data?.from === "string"
            ? data.from
            : null;
  return { event, hasDataKey, fromMe, remoteJid };
}

export function getZappfyWebhookParseMeta(payload: unknown): {
  event: unknown;
  blobCount: number;
  rejectReason?: string;
} {
  const p = payload as Record<string, unknown>;
  const event = p.event ?? p.type ?? p.action;
  if (!zappfyEventIsMessages(p)) {
    return {
      event,
      blobCount: 0,
      rejectReason: `evento ignorado (${String(event ?? "sem evento")})`,
    };
  }
  const blobs = extractZappfyMessageBlobs(payload);
  if (blobs.length === 0) {
    return {
      event,
      blobCount: 0,
      rejectReason: "nenhum blob em data/message",
    };
  }
  const parsed = new ZappfyWhatsAppProvider({
    baseUrl: "https://api.zappfy.io",
    instanceToken: "probe",
  }).parseWebhook(payload);
  if (parsed.length === 0) {
    return {
      event,
      blobCount: blobs.length,
      rejectReason: describeZappfyParseFailure(blobs[0]),
    };
  }
  return { event, blobCount: blobs.length };
}

function describeZappfyParseFailure(blob: Record<string, unknown> | undefined): string {
  if (!blob) return "blob vazio";
  const key = blob.key as Record<string, unknown> | undefined;
  const remoteJid = String(
    key?.remoteJid ?? blob.chatId ?? blob.from ?? blob.remoteJid ?? "",
  );
  if (!remoteJid && !String(blob.from ?? "").replace(/\D/g, "")) {
    return "sem remoteJid/from";
  }
  const msg = blob.message;
  const hasProto = msg && typeof msg === "object";
  const hasFlatText =
    typeof blob.text === "string" ||
    typeof blob.body === "string" ||
    typeof blob.messageText === "string";
  if (!hasFlatText && !hasProto) {
    return "sem texto nem message proto";
  }
  if (hasProto && !extractZappfyText(blob, msg as Record<string, unknown>)) {
    return "message proto sem texto/mídia reconhecida";
  }
  return "filtro fromMe/grupo/JID";
}

function parseTimestamp(raw: unknown): Date {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as { low?: number; high?: number };
    if (typeof o.low === "number") {
      const low = o.low >>> 0;
      const high = typeof o.high === "number" ? o.high : 0;
      const n = high > 0 ? high * 0x100000000 + low : low;
      if (n > 0 && n < 1e12) return new Date(n * 1000);
      return new Date(n);
    }
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return new Date();
  if (n > 0 && n < 1e12) return new Date(n * 1000);
  return new Date(n);
}

function digitsFromJidOrPhone(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let local = s.includes("@") ? (s.split("@")[0] ?? "") : s;
  if (local.includes(":")) local = local.split(":")[0] ?? local;
  return local.replace(/\D/g, "");
}

function unwrapProtoContent(
  message: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  return message;
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

function extractZappfyText(
  data: Record<string, unknown>,
  message?: Record<string, unknown>,
): string {
  const textRaw =
    data.text ??
    data.body ??
    data.messageText ??
    (message ? extractTextFromProto(message) : undefined);
  if (typeof textRaw === "string" && textRaw.trim()) return textRaw.trim();

  const root = unwrapProtoContent(message);
  const typeRaw =
    data.messageType ??
    data.type ??
    (root ? Object.keys(root)[0] : undefined);
  const type = typeof typeRaw === "string" ? typeRaw.toLowerCase() : "";

  if (
    root?.audioMessage ||
    root?.pttMessage ||
    type.includes("audio") ||
    type.includes("ptt")
  ) {
    return "[Áudio]";
  }
  if (root?.imageMessage || type.includes("image")) return "[Imagem]";
  if (root?.videoMessage || root?.stickerMessage || type.includes("video")) {
    return "[Mídia]";
  }
  if (root?.documentMessage || type.includes("document") || type.includes("pdf")) {
    return "[Documento]";
  }
  if (type.includes("contact")) return "[Contato]";
  if (type.includes("location")) return "[Localização]";
  return "";
}

function extractZappfyMedia(
  data: Record<string, unknown>,
  message?: Record<string, unknown>,
): { mediaUrl: string | null; mediaType: string | null } {
  const root = unwrapProtoContent(message);
  if (!root) {
    const b64Raw =
      (typeof data.base64 === "string" && data.base64) ||
      (typeof data.messageBase64 === "string" && data.messageBase64) ||
      (typeof data.mediaBase64 === "string" && data.mediaBase64) ||
      null;
    if (b64Raw) {
      const trimmed = b64Raw.trim();
      const mime =
        typeof data.mimetype === "string"
          ? data.mimetype.split(";")[0]?.trim()
          : "application/octet-stream";
      if (trimmed.startsWith("data:")) {
        return { mediaUrl: trimmed, mediaType: mime };
      }
      return { mediaUrl: `data:${mime};base64,${trimmed}`, mediaType: mime };
    }
    return { mediaUrl: null, mediaType: null };
  }

  const aud = (root.audioMessage ?? root.pttMessage) as
    | Record<string, unknown>
    | undefined;
  const img = root.imageMessage as Record<string, unknown> | undefined;
  const vid = root.videoMessage as Record<string, unknown> | undefined;
  const doc = root.documentMessage as Record<string, unknown> | undefined;
  const node = aud ?? img ?? vid ?? doc;
  if (!node) return { mediaUrl: null, mediaType: null };

  const mimeRaw =
    typeof node.mimetype === "string"
      ? node.mimetype
      : aud
        ? "audio/ogg; codecs=opus"
        : img
          ? "image/jpeg"
          : vid
            ? "video/mp4"
            : "application/pdf";
  const mime = mimeRaw.split(";")[0]?.trim() || "application/octet-stream";

  const urlRaw = typeof node.url === "string" ? node.url.trim() : "";
  if (urlRaw.startsWith("http://") || urlRaw.startsWith("https://")) {
    return { mediaUrl: urlRaw, mediaType: mime };
  }

  const b64Raw =
    (typeof data.base64 === "string" && data.base64) ||
    (typeof data.messageBase64 === "string" && data.messageBase64) ||
    (typeof data.mediaBase64 === "string" && data.mediaBase64) ||
    (typeof node.base64 === "string" && node.base64) ||
    null;

  if (!b64Raw) return { mediaUrl: null, mediaType: mime };

  const trimmed = b64Raw.trim();
  if (trimmed.startsWith("data:")) {
    return { mediaUrl: trimmed, mediaType: mime };
  }
  const b64 = trimmed.replace(/^data:[^;]+;base64,/, "");
  if (b64.length > 15_000_000) return { mediaUrl: null, mediaType: mime };
  return { mediaUrl: `data:${mime};base64,${b64}`, mediaType: mime };
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

  const rawMsg = data.message ?? data.msg;
  let message: Record<string, unknown> | undefined;
  if (rawMsg && typeof rawMsg === "object" && !Array.isArray(rawMsg)) {
    message = rawMsg as Record<string, unknown>;
  } else if (typeof rawMsg === "string" && rawMsg.trim()) {
    message = tryParseJsonObject(rawMsg.trim()) ?? undefined;
  }

  const text = extractZappfyText(data, message);
  if (!text) return null;

  const keyId = key?.id ? String(key.id) : undefined;
  const externalId = String(
    keyId ??
      data.messageId ??
      data.id ??
      `${from}-${Date.now()}`,
  );
  const fromMe = data.fromMe === true || key?.fromMe === true;
  const media = extractZappfyMedia(data, message);

  return {
    externalId,
    whatsappKeyId: keyId,
    from,
    body: text,
    timestamp: parseTimestamp(
      data.messageTimestamp ?? data.timestamp ?? key?.messageTimestamp,
    ),
    profileName:
      typeof data.pushName === "string"
        ? data.pushName
        : typeof data.profileName === "string"
          ? data.profileName
          : undefined,
    fromMe,
    mediaUrl: media.mediaUrl,
    mediaType: media.mediaType,
    debug: {
      remoteJid: remoteJid || undefined,
      participant: key?.participant ? String(key.participant) : undefined,
    },
  };
}
