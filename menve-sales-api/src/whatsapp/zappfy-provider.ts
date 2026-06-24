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

  async fetchInboundMediaBase64(args: {
    keyId: string;
    keyIdAlt?: string;
    downloadIds?: string[];
    remoteJid: string;
    remoteJidAlt?: string;
  }) {
    const ids = orderZappfyDownloadIds(
      args.downloadIds?.length
        ? args.downloadIds
        : [args.keyIdAlt, args.keyId].filter(
            (id): id is string => typeof id === "string" && !!id.trim(),
          ),
    );

    const jids = [args.remoteJid, args.remoteJidAlt].filter(
      (j, i, arr) => typeof j === "string" && j.trim() && arr.indexOf(j) === i,
    ) as string[];

    const delaysMs = [0, 600, 1500];
    for (const delayMs of delaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      for (const id of ids) {
        const zappfyDownloadBodies: Record<string, unknown>[] = [
          { id },
          { id, generate_mp3: true },
          { id, return_link: true, generate_mp3: true },
          {
            id,
            return_base64: true,
            return_link: true,
            generate_mp3: true,
          },
          { id, return_base64: true, return_link: false, generate_mp3: true },
          { id, return_base64: true, generate_mp3: false },
          { id, return_base64: true },
        ];

        for (const body of zappfyDownloadBodies) {
          const parsed = await this.postZappfyMediaDownload("/message/download", body, id);
          if (parsed) return parsed;
        }

        for (const jid of jids) {
          for (const path of [
            "/chat/getBase64FromMediaMessage",
            "/message/getBase64FromMediaMessage",
          ]) {
            const parsed = await this.postZappfyMediaDownload(
              path,
              {
                message: { key: { id, remoteJid: jid } },
                convertToMp4: false,
              },
              id,
            );
            if (parsed) return parsed;
          }
        }

        for (const path of [
          "/chat/getBase64FromMediaMessage",
          "/message/getBase64FromMediaMessage",
        ]) {
          const parsed = await this.postZappfyMediaDownload(
            path,
            { message: { key: { id } }, convertToMp4: false },
            id,
          );
          if (parsed) return parsed;
        }
      }
    }

    return null;
  }

  private async postZappfyMediaDownload(
    path: string,
    body: Record<string, unknown>,
    messageId: string,
  ): Promise<{ base64?: string; url?: string; mimetype?: string } | null> {
    try {
      const res = await fetch(`${this.base()}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        console.warn("[zappfy:media-download]", {
          path,
          status: res.status,
          messageId,
          error:
            typeof json.error === "string"
              ? json.error
              : typeof json.message === "string"
                ? json.message
                : null,
        });
        return null;
      }
      const parsed = extractZappfyDownloadPayload(json);
      if (!parsed) {
        console.warn("[zappfy:media-download]", {
          path,
          status: res.status,
          messageId,
          keys: Object.keys(json).slice(0, 12).join(","),
        });
      }
      return parsed;
    } catch (e) {
      console.warn("[zappfy:media-download]", {
        path,
        messageId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
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
  const ev =
    payload.event ??
    payload.type ??
    payload.action ??
    payload.EventType ??
    payload.eventType;
  if (ev == null) return true;
  if (typeof ev !== "string") return true;
  const n = ev.trim().replace(/[.-]/g, "_").toUpperCase();
  if (n === "MESSAGE_UPDATED" || n === "MESSAGES_UPDATE") return false;
  return (
    n === "MESSAGES" ||
    n === "MESSAGE" ||
    n === "NEW_MESSAGE" ||
    n === "MESSAGES_RECEIVED"
  );
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

/** Lê campo com fallback case-insensitive (painel Zappfy usa `chatid`, `content`, etc.). */
function pickBlobField(
  blob: Record<string, unknown>,
  ...names: string[]
): unknown {
  for (const name of names) {
    if (blob[name] !== undefined) return blob[name];
    const lower = name.toLowerCase();
    for (const k of Object.keys(blob)) {
      if (k.toLowerCase() === lower) return blob[k];
    }
  }
  return undefined;
}

function asTrimmedString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function ensureJidSuffix(jid: string, suffix: string): string {
  return jid.includes("@") ? jid : `${jid}${suffix}`;
}

function pickZappfyJidFromIsOnWhatsApp(blob: Record<string, unknown>): string | null {
  const onWa = blob.isOnWhatsApp;
  if (!Array.isArray(onWa)) return null;
  for (const item of onWa) {
    if (!item || typeof item !== "object") continue;
    const jid = (item as Record<string, unknown>).jid;
    if (typeof jid === "string" && jid.trim()) return jid.trim();
  }
  return null;
}

/** Normaliza variações Uazapi/Zappfy (proto aninhado, number, isOnWhatsApp, messageBody, chatid/content). */
function normalizeZappfyMessageBlob(raw: Record<string, unknown>): Record<string, unknown> {
  let blob = raw;

  const flatChatId = asTrimmedString(pickBlobField(blob, "chatId", "chatid"));
  const flatChatLid = asTrimmedString(pickBlobField(blob, "chatLid", "chatlid"));
  const flatContent = asTrimmedString(pickBlobField(blob, "content"));
  const flatMessageId = asTrimmedString(
    pickBlobField(blob, "messageId", "messageid", "id"),
  );

  const wrapped = blob.message;
  if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
    const w = wrapped as Record<string, unknown>;
    if (w.key && typeof w.key === "object") {
      blob = {
        ...blob,
        ...w,
        message: w.message ?? blob.message,
        key: w.key,
        pushName:
          w.pushName ??
          blob.pushName ??
          (typeof blob.pushName === "string" ? blob.pushName : undefined),
        messageTimestamp:
          w.messageTimestamp ?? blob.messageTimestamp ?? w.timestamp,
      };
    }
  }

  const messagesNode = blob.messages;
  if (messagesNode && typeof messagesNode === "object" && !Array.isArray(messagesNode)) {
    const m = messagesNode as Record<string, unknown>;
    blob = {
      ...blob,
      ...m,
      message: m.message ?? blob.message,
      key: m.key ?? blob.key,
      messageBody:
        typeof m.messageBody === "string"
          ? m.messageBody
          : blob.messageBody,
    };
  }

  const key = (
    blob.key && typeof blob.key === "object" && !Array.isArray(blob.key)
      ? (blob.key as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  const remoteFromKey =
    typeof key.remoteJid === "string"
      ? key.remoteJid
      : typeof key.remoteJidAlt === "string"
        ? key.remoteJidAlt
        : typeof key.participant === "string"
          ? key.participant
          : typeof key.participantAlt === "string"
            ? key.participantAlt
            : null;

  const jidFallback =
    remoteFromKey ??
    (typeof blob.remoteJid === "string" ? blob.remoteJid : null) ??
    flatChatLid ??
    (typeof blob.chatId === "string" ? blob.chatId : null) ??
    flatChatId ??
    pickZappfyJidFromIsOnWhatsApp(blob);

  const phoneRaw =
    blob.from ??
    blob.number ??
    blob.phone ??
    blob.sender ??
    blob.senderPn ??
    key.cleanedSenderPn ??
    key.cleanedParticipantPn;

  const remoteJidAltFromFlat =
    flatChatId && flatChatLid && flatChatId !== flatChatLid ? flatChatId : null;

  if (jidFallback && !remoteFromKey) {
    const remoteJidNorm = isLidJid(jidFallback)
      ? ensureJidSuffix(jidFallback.split("@")[0] ?? jidFallback, "@lid")
      : jidFallback.includes("@")
        ? jidFallback
        : ensureJidSuffix(jidFallback.replace(/\D/g, ""), "@s.whatsapp.net");
    blob = {
      ...blob,
      key: {
        ...key,
        remoteJid: remoteJidNorm,
        remoteJidAlt:
          (typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : null) ??
          remoteJidAltFromFlat ??
          (flatChatId && !isLidJid(flatChatId) ? flatChatId : undefined),
        fromMe: key.fromMe ?? blob.fromMe,
        id: key.id ?? flatMessageId ?? undefined,
      },
    };
  } else if (remoteJidAltFromFlat && !key.remoteJidAlt) {
    blob = {
      ...blob,
      key: {
        ...key,
        remoteJidAlt: remoteJidAltFromFlat,
        id: key.id ?? flatMessageId ?? undefined,
      },
    };
  } else if (flatMessageId && !key.id) {
    blob = {
      ...blob,
      key: { ...key, id: flatMessageId },
      messageId: blob.messageId ?? flatMessageId,
    };
  }

  if (!blob.from && phoneRaw != null) {
    const phoneStr = String(phoneRaw).trim();
    if (!isLidJid(phoneStr) && !phoneStr.startsWith("lid:")) {
      blob = { ...blob, from: phoneRaw };
    }
  }

  if (
    flatContent &&
    blob.text == null &&
    (typeof blob.body !== "string" || !String(blob.body).trim())
  ) {
    blob = { ...blob, text: flatContent };
  }

  if (
    typeof blob.messageBody === "string" &&
    blob.messageBody.trim() &&
    blob.text == null &&
    (typeof blob.body !== "string" || !String(blob.body).trim())
  ) {
    blob = { ...blob, text: blob.messageBody.trim() };
  }

  return blob;
}

function hasZappfySenderHint(blob: Record<string, unknown>): boolean {
  const key = blob.key as Record<string, unknown> | undefined;
  return !!(
    blob.from ??
    blob.number ??
    blob.phone ??
    blob.chatId ??
    pickBlobField(blob, "chatid", "chatId") ??
    pickBlobField(blob, "chatlid", "chatLid") ??
    blob.remoteJid ??
    key?.remoteJid ??
    key?.cleanedSenderPn ??
    key?.cleanedParticipantPn ??
    pickZappfyJidFromIsOnWhatsApp(blob)
  );
}

function extractZappfyMessageBlobs(payload: unknown): Record<string, unknown>[] {
  let p = payload as Record<string, unknown>;

  const bodyRaw = p.body;
  if (typeof bodyRaw === "string") {
    const parsed = tryParseJsonObject(bodyRaw.trim());
    if (
      parsed &&
      (parsed.data != null ||
        parsed.event != null ||
        parsed.type != null ||
        parsed.message != null ||
        parsed.messages != null)
    ) {
      p = parsed;
    }
  } else if (bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw)) {
    const b = bodyRaw as Record<string, unknown>;
    if (b.data != null || b.event != null || b.type != null || b.message != null) {
      p = b;
    }
  }

  if (!zappfyEventIsMessages(p)) return [];

  let d: unknown =
    p.data ?? p.message ?? p.payload ?? p.messages;
  if (typeof d === "string") {
    const parsed = tryParseJsonObject(d.trim());
    d = parsed ?? d;
  }

  const normalizeAll = (items: Record<string, unknown>[]) =>
    items.map((item) => normalizeZappfyMessageBlob(item));

  if (Array.isArray(d)) {
    return normalizeAll(
      d.filter((x) => x && typeof x === "object") as Record<string, unknown>[],
    );
  }

  if (d && typeof d === "object") {
    const inner = d as Record<string, unknown>;
    if (inner.messages != null) {
      const msgs = Array.isArray(inner.messages)
        ? inner.messages
        : typeof inner.messages === "object"
          ? [inner.messages]
          : Object.values(inner.messages);
      const fromMessages = msgs.filter(
        (x) => x && typeof x === "object",
      ) as Record<string, unknown>[];
      if (fromMessages.length > 0) return normalizeAll(fromMessages);
    }
    return normalizeAll([inner]);
  }

  if (
    hasZappfySenderHint(p) &&
    (p.text != null ||
      typeof p.body === "string" ||
      p.message != null ||
      typeof p.messageBody === "string" ||
      pickBlobField(p, "content") != null)
  ) {
    return normalizeAll([p]);
  }

  return [];
}

function pickZappfyDisplayRemoteJid(
  blob: Record<string, unknown> | undefined,
): string | null {
  if (!blob) return null;
  const key = blob.key as Record<string, unknown> | undefined;
  if (typeof key?.remoteJid === "string") return key.remoteJid;
  if (typeof blob.remoteJid === "string") return blob.remoteJid;
  const chatLid = asTrimmedString(pickBlobField(blob, "chatLid", "chatlid"));
  if (chatLid) return chatLid.includes("@") ? chatLid : `${chatLid}@lid`;
  if (typeof blob.chatId === "string") return blob.chatId;
  const chatId = asTrimmedString(pickBlobField(blob, "chatId", "chatid"));
  if (chatId) return chatId;
  const from = asTrimmedString(blob.from);
  if (from && !isLidJid(from) && !from.startsWith("lid:")) return from;
  const number = asTrimmedString(blob.number);
  if (number) return number;
  return pickZappfyJidFromIsOnWhatsApp(blob);
}

/** Campos úteis para log/diagnóstico sem serializar o body inteiro. */
export function getZappfyWebhookInboxSample(payload: unknown): {
  event: unknown;
  hasDataKey: boolean;
  fromMe: unknown;
  remoteJid: string | null;
} {
  const p = payload as Record<string, unknown>;
  const event =
    p.event ?? p.type ?? p.action ?? p.EventType ?? p.eventType;
  const blobs = extractZappfyMessageBlobs(payload);
  const sampleBlob = blobs[0];
  const key = sampleBlob?.key as Record<string, unknown> | undefined;
  const hasDataKey = !!(key && typeof key === "object");
  const fromMe = key?.fromMe ?? sampleBlob?.fromMe ?? p.fromMe;
  const remoteJid = pickZappfyDisplayRemoteJid(sampleBlob);
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

/** Chaves do primeiro blob (diagnóstico sem expor conteúdo). */
export function getZappfyWebhookBlobKeys(payload: unknown): string {
  const blobs = extractZappfyMessageBlobs(payload);
  if (!blobs[0]) {
    const p = payload as Record<string, unknown>;
    return Object.keys(p).slice(0, 14).join(",");
  }
  return Object.keys(blobs[0]).slice(0, 18).join(",");
}

function describeZappfyParseFailure(blob: Record<string, unknown> | undefined): string {
  if (!blob) return "blob vazio";
  const normalized = normalizeZappfyMessageBlob(blob);
  const key = normalized.key as Record<string, unknown> | undefined;
  const remoteJid = String(
    key?.remoteJid ??
      normalized.chatId ??
      normalized.from ??
      normalized.remoteJid ??
      normalized.number ??
      pickZappfyJidFromIsOnWhatsApp(normalized) ??
      "",
  );
  if (!remoteJid && !String(normalized.from ?? normalized.number ?? "").replace(/\D/g, "")) {
    return `sem remoteJid/from (keys=${Object.keys(normalized).slice(0, 10).join(",")})`;
  }
  const msg = normalized.message;
  const hasProto = msg && typeof msg === "object";
  const hasFlatText =
    typeof normalized.text === "string" ||
    typeof normalized.body === "string" ||
    typeof normalized.messageText === "string" ||
    typeof normalized.messageBody === "string" ||
    !!asTrimmedString(pickBlobField(normalized, "content"));
  if (!hasFlatText && !hasProto) {
    return "sem texto nem message proto";
  }
  if (hasProto && !extractZappfyText(normalized, msg as Record<string, unknown>)) {
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

function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid");
}

function isPhoneChatJid(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us");
}

/** Dígitos plausíveis de telefone (evita tratar LID longo como número). */
function plausiblePhoneDigits(digits: string): boolean {
  if (digits.length < 10 || digits.length > 13) return false;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return true;
  }
  return digits.length >= 10 && digits.length <= 12;
}

/**
 * Resolve telefone real vs LID (@lid). WhatsApp multidevice envia remoteJid como LID
 * e o PN em remoteJidAlt / cleanedSenderPn.
 */
function resolveZappfySenderIdentity(blob: Record<string, unknown>): {
  from: string;
  remoteJid: string;
} | null {
  const key = (
    blob.key && typeof blob.key === "object" && !Array.isArray(blob.key)
      ? (blob.key as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  const flatChatId = asTrimmedString(pickBlobField(blob, "chatId", "chatid"));
  const flatChatLid = asTrimmedString(pickBlobField(blob, "chatLid", "chatlid"));

  const remoteJid = String(
    key.remoteJid ??
      blob.remoteJid ??
      flatChatLid ??
      pickZappfyJidFromIsOnWhatsApp(blob) ??
      "",
  );
  const remoteJidAlt =
    (typeof key.remoteJidAlt === "string" ? key.remoteJidAlt.trim() : "") ||
    (flatChatId && !isLidJid(flatChatId) ? flatChatId : "");
  const participantAlt =
    typeof key.participantAlt === "string" ? key.participantAlt.trim() : "";
  const participant =
    typeof key.participant === "string" ? key.participant.trim() : "";

  const explicitPhoneCandidates: unknown[] = [
    key.cleanedSenderPn,
    key.cleanedParticipantPn,
    flatChatId,
    blob.number,
    blob.phone,
    blob.sender,
    blob.senderPn,
  ];

  const fromRaw = blob.from;
  if (fromRaw != null) {
    const fromStr = String(fromRaw).trim();
    if (fromStr && !isLidJid(fromStr) && !fromStr.startsWith("lid:")) {
      explicitPhoneCandidates.unshift(fromRaw);
    }
  }

  for (const c of explicitPhoneCandidates) {
    const d = digitsFromJidOrPhone(c);
    if (plausiblePhoneDigits(d)) {
      return {
        from: d,
        remoteJid: remoteJid || remoteJidAlt || `${d}@s.whatsapp.net`,
      };
    }
  }

  const jidPhoneSources = [remoteJidAlt, participantAlt, participant];
  if (isPhoneChatJid(remoteJid)) jidPhoneSources.push(remoteJid);

  for (const jid of jidPhoneSources) {
    if (!jid || isLidJid(jid)) continue;
    const d = digitsFromJidOrPhone(jid);
    if (plausiblePhoneDigits(d)) {
      return { from: d, remoteJid: remoteJid || jid };
    }
  }

  if (isLidJid(remoteJid)) {
    const local = remoteJid.split("@")[0] ?? "";
    if (local) {
      return { from: `lid:${local}`, remoteJid };
    }
  }

  if (remoteJid && !isLidJid(remoteJid)) {
    const d = digitsFromJidOrPhone(remoteJid);
    if (plausiblePhoneDigits(d)) {
      return { from: d, remoteJid };
    }
  }

  return null;
}

function orderZappfyDownloadIds(ids: string[]): string[] {
  const unique = ids
    .map((id) => id.trim())
    .filter((id, i, arr) => id && arr.indexOf(id) === i);
  return unique.sort((a, b) => {
    const aComposite = a.includes(":");
    const bComposite = b.includes(":");
    if (aComposite && !bComposite) return -1;
    if (!aComposite && bComposite) return 1;
    return b.length - a.length;
  });
}

function buildZappfyDownloadIds(
  blob: Record<string, unknown>,
  key?: Record<string, unknown>,
): string[] {
  const messageIdRaw = asTrimmedString(pickBlobField(blob, "messageId", "messageid"));
  const idRaw = asTrimmedString(pickBlobField(blob, "id"));
  const keyIdStr = key?.id ? String(key.id) : undefined;
  const flatChatId = asTrimmedString(pickBlobField(blob, "chatId", "chatid"));
  const chatDigits = flatChatId ? digitsFromJidOrPhone(flatChatId) : "";
  const hexFromId = idRaw?.includes(":") ? (idRaw.split(":")[1] ?? "") : "";

  const candidates: string[] = [];
  const push = (v?: string | null) => {
    const t = v?.trim();
    if (t) candidates.push(t);
  };

  push(idRaw?.includes(":") ? idRaw : undefined);
  if (messageIdRaw && idRaw?.includes(":")) {
    push(`${idRaw.split(":")[0]}:${messageIdRaw}`);
  }
  if (messageIdRaw && chatDigits) push(`${chatDigits}:${messageIdRaw}`);
  if (hexFromId && messageIdRaw && hexFromId !== messageIdRaw) {
    push(messageIdRaw);
  }
  push(idRaw);
  push(messageIdRaw);
  push(keyIdStr);

  return orderZappfyDownloadIds(candidates);
}

function collectZappfyResponseNodes(
  json: Record<string, unknown>,
): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const visit = (node: Record<string, unknown>) => {
    if (seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
    for (const key of [
      "data",
      "result",
      "response",
      "file",
      "media",
      "message",
      "payload",
    ]) {
      const child = node[key];
      if (child && typeof child === "object" && !Array.isArray(child)) {
        visit(child as Record<string, unknown>);
      }
    }
  };
  visit(json);
  return nodes;
}

function extractZappfyDownloadPayload(
  json: Record<string, unknown>,
): { base64?: string; url?: string; mimetype?: string } | null {
  const pick = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  for (const node of collectZappfyResponseNodes(json)) {
    const url =
      pick(node.fileURL) ||
      pick(node.fileUrl) ||
      pick(node.url) ||
      pick(node.mediaUrl) ||
      pick(node.link);
    const b64 =
      pick(node.base64Data) ||
      pick(node.base64) ||
      pick(node.fileBase64) ||
      pick(node.mediaBase64) ||
      pick(node.messageBase64);
    const mimetype =
      pick(node.mimetype) ||
      pick(node.mimeType) ||
      pick(node.mediaType);

    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      return { url, mimetype, base64: b64 };
    }
    if (b64) return { base64: b64, mimetype };
  }
  return null;
}

/** Exportado para selftest — formato documentado em docs.zappfy.io/message/download */
export function parseZappfyDownloadResponse(json: Record<string, unknown>) {
  return extractZappfyDownloadPayload(json);
}

function zappfyMediaKindTokens(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const field of ["messageType", "mediaType", "type"]) {
    const raw = pickBlobField(data, field);
    if (typeof raw === "string" && raw.trim()) {
      parts.push(raw.trim().toLowerCase());
    }
  }
  return parts.join(" ");
}

function flatMimeFromBlob(data: Record<string, unknown>, kind: string): string {
  const raw =
    asTrimmedString(pickBlobField(data, "mimetype", "mimeType", "mediaType")) ??
    "";
  if (raw.includes("/")) return raw.split(";")[0]?.trim() || "application/octet-stream";
  if (kind.includes("audio") || kind.includes("ptt")) {
    return "audio/ogg; codecs=opus";
  }
  if (kind.includes("image")) return "image/jpeg";
  if (kind.includes("video")) return "video/mp4";
  if (kind.includes("document") || kind.includes("pdf")) return "application/pdf";
  return "application/octet-stream";
}

function extractFlatMediaUrl(data: Record<string, unknown>): string | null {
  for (const field of [
    "fileURL",
    "fileUrl",
    "fileurl",
    "mediaUrl",
    "mediaurl",
    "url",
    "file",
    "media",
  ]) {
    const s = asTrimmedString(pickBlobField(data, field));
    if (s?.startsWith("http://") || s?.startsWith("https://")) return s;
  }
  const content = asTrimmedString(pickBlobField(data, "content"));
  if (content?.startsWith("http://") || content?.startsWith("https://")) {
    return content;
  }
  return null;
}

function extractConvertOptionsBase64(
  data: Record<string, unknown>,
): { b64: string; mime?: string } | null {
  const opts = pickBlobField(data, "convertOptions", "convertoptions");
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) return null;
  const o = opts as Record<string, unknown>;
  const b64 = asTrimmedString(o.base64 ?? o.fileBase64 ?? o.data ?? o.mediaBase64);
  if (!b64) return null;
  const mime = asTrimmedString(o.mimetype ?? o.mimeType ?? o.mediaType) ?? undefined;
  return { b64, mime };
}

function pickFlatBase64(data: Record<string, unknown>): string | null {
  for (const field of ["base64", "messageBase64", "mediaBase64", "fileBase64"]) {
    const s = asTrimmedString(pickBlobField(data, field));
    if (s) return s;
  }
  return extractConvertOptionsBase64(data)?.b64 ?? null;
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
  const kind = zappfyMediaKindTokens(data);
  const contentRaw = asTrimmedString(pickBlobField(data, "content"));
  const contentAsText =
    contentRaw &&
    !contentRaw.startsWith("http://") &&
    !contentRaw.startsWith("https://") &&
    !kind.includes("audio") &&
    !kind.includes("ptt") &&
    !kind.includes("image") &&
    !kind.includes("video") &&
    !kind.includes("document")
      ? contentRaw
      : undefined;

  const textRaw =
    data.text ??
    data.body ??
    data.messageText ??
    data.messageBody ??
    contentAsText ??
    (message ? extractTextFromProto(message) : undefined);
  if (typeof textRaw === "string" && textRaw.trim()) return textRaw.trim();

  const root = unwrapProtoContent(message);
  const type = kind;

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
  const kind = zappfyMediaKindTokens(data);
  const root = unwrapProtoContent(message);
  if (!root) {
    const converted = extractConvertOptionsBase64(data);
    const b64Raw = pickFlatBase64(data);
    const flatUrl = extractFlatMediaUrl(data);
    const mimeFromFlat = flatMimeFromBlob(data, kind);

    if (b64Raw || converted?.b64) {
      const trimmed = (b64Raw ?? converted?.b64 ?? "").trim();
      const mime =
        converted?.mime?.split(";")[0]?.trim() ??
        (typeof data.mimetype === "string"
          ? data.mimetype.split(";")[0]?.trim()
          : mimeFromFlat);
      if (trimmed.startsWith("data:")) {
        return { mediaUrl: trimmed, mediaType: mime };
      }
      return { mediaUrl: `data:${mime};base64,${trimmed}`, mediaType: mime };
    }

    if (flatUrl) {
      return { mediaUrl: flatUrl, mediaType: mimeFromFlat };
    }

    return { mediaUrl: null, mediaType: kind ? mimeFromFlat : null };
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
  const blob = normalizeZappfyMessageBlob(data);
  const key = blob.key as Record<string, unknown> | undefined;
  const sender = resolveZappfySenderIdentity(blob);
  if (!sender) return null;

  const { from, remoteJid } = sender;
  if (remoteJid.includes("status@broadcast")) return null;

  const isGroupFlag = pickBlobField(blob, "isGroup", "is_group");
  const isGroupLike =
    remoteJid.includes("@g.us") ||
    isGroupFlag === true ||
    isGroupFlag === "true" ||
    isGroupFlag === 1 ||
    String(key?.participant ?? "").includes("@g.us");
  if (isGroupLike && !ALLOW_GROUPS) return null;

  const rawMsg = blob.message ?? blob.msg;
  let message: Record<string, unknown> | undefined;
  if (rawMsg && typeof rawMsg === "object" && !Array.isArray(rawMsg)) {
    message = rawMsg as Record<string, unknown>;
  } else if (typeof rawMsg === "string" && rawMsg.trim()) {
    message = tryParseJsonObject(rawMsg.trim()) ?? undefined;
  }

  const text = extractZappfyText(blob, message);
  if (!text) return null;

  const downloadIds = buildZappfyDownloadIds(blob, key);
  const messageIdRaw = asTrimmedString(pickBlobField(blob, "messageId", "messageid"));
  const idRaw = asTrimmedString(pickBlobField(blob, "id"));
  const keyId = downloadIds[0] ?? messageIdRaw ?? idRaw ?? undefined;
  const keyIdAlt = downloadIds.find((id) => id !== keyId);
  const externalId = String(
    messageIdRaw ?? idRaw ?? keyId ?? `${from}-${Date.now()}`,
  );
  const fromMe = blob.fromMe === true || key?.fromMe === true;
  const media = extractZappfyMedia(blob, message);

  return {
    externalId,
    whatsappKeyId: keyId,
    from,
    body: text,
    timestamp: parseTimestamp(
      blob.messageTimestamp ?? blob.timestamp ?? key?.messageTimestamp,
    ),
    profileName:
      typeof blob.pushName === "string"
        ? blob.pushName
        : typeof blob.profileName === "string"
          ? blob.profileName
          : undefined,
    fromMe,
    mediaUrl: media.mediaUrl,
    mediaType: media.mediaType,
    debug: {
      remoteJid: remoteJid || undefined,
      participant: key?.participant ? String(key.participant) : undefined,
      remoteJidAlt:
        typeof key?.remoteJidAlt === "string" ? key.remoteJidAlt : undefined,
      keyIdAlt: keyIdAlt || undefined,
      downloadIds: downloadIds.length > 0 ? downloadIds : undefined,
    },
  };
}
