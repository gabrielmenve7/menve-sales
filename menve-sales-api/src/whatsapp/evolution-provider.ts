import type {
  IWhatsAppProvider,
  NormalizedInbound,
  SendOutboundMediaInput,
} from "./provider.interface";

type EvolutionConfig = {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
};

const ALLOW_GROUPS =
  process.env.WHATSAPP_ALLOW_GROUPS?.trim().toLowerCase() === "true";

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
  constructor(private readonly config: EvolutionConfig) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      apikey: this.config.apiKey,
    };
  }

  async sendTextMessage(to: string, text: string) {
    try {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/message/sendText/${this.config.instanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          number: to.replace(/\D/g, ""),
          text,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        key?: { id?: string };
      };
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true, externalId: json.key?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  async sendOutboundMedia(input: SendOutboundMediaInput) {
    const base = this.config.baseUrl.replace(/\/$/, "");
    const inst = encodeURIComponent(this.config.instanceName);
    const number = input.to.replace(/\D/g, "");
    const media =
      input.base64.trim().startsWith("data:") ||
      input.base64.includes(";base64,")
        ? input.base64.trim()
        : `data:${input.mimeType};base64,${input.base64.trim()}`;

    try {
      if (input.kind === "audio") {
        const url = `${base}/message/sendWhatsAppAudio/${inst}`;
        const res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ number, audio: media }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          key?: { id?: string };
        };
        if (!res.ok) {
          return {
            ok: false,
            error: `Evolution audio HTTP ${res.status}: ${JSON.stringify(json)}`,
          };
        }
        return { ok: true, externalId: json.key?.id };
      }

      const mediatype = input.kind === "image" ? "image" : "document";
      const fileName =
        input.fileName?.trim() ||
        (input.kind === "image" ? "image.jpg" : "documento.pdf");
      const url = `${base}/message/sendMedia/${inst}`;
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
        key?: { id?: string };
      };
      if (!res.ok) {
        return {
          ok: false,
          error: `Evolution media HTTP ${res.status}: ${JSON.stringify(json)}`,
        };
      }
      return { ok: true, externalId: json.key?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  async getConnectionStatus() {
    try {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/instance/connectionState/${this.config.instanceName}`;
      const res = await fetch(url, { headers: this.headers() });
      const json = (await res.json().catch(() => ({}))) as {
        instance?: { state?: string };
      };
      const state = json.instance?.state;
      return {
        connected: state === "open",
        detail: state,
      };
    } catch (e) {
      return {
        connected: false,
        detail: e instanceof Error ? e.message : "Erro",
      };
    }
  }

  async getContactProfile(phone: string) {
    const digits = phone.replace(/\D/g, "");
    if (!digits) return {};

    const profile = await this.fetchContactProfile(digits).catch(() => null);
    if (!profile) {
      const photoUrl = await this.fetchProfilePictureUrl(digits).catch(() => null);
      return { photoUrl };
    }

    // fetchProfile pode trazer apenas nome (sem picture). Se não vier foto,
    // faz fallback no endpoint de picture.
    if (profile.photoUrl) return profile;

    const photoUrl = await this.fetchProfilePictureUrl(digits).catch(() => null);
    return { name: profile.name, photoUrl };
  }

  parseWebhook(payload: unknown): NormalizedInbound[] {
    const blobs = extractMessageBlobs(payload);
    const out: NormalizedInbound[] = [];
    for (const data of blobs) {
      const parsed = parseOneEvolutionMessage(data);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  async fetchInboundMediaBase64(args: { keyId: string; remoteJid: string }) {
    try {
      const base = this.config.baseUrl.replace(/\/$/, "");
      const inst = encodeURIComponent(this.config.instanceName);
      const url = `${base}/chat/getBase64FromMediaMessage/${inst}`;
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          message: {
            key: {
              id: args.keyId,
              remoteJid: args.remoteJid,
            },
          },
          convertToMp4: false,
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const pick = (v: unknown): string | undefined =>
        typeof v === "string" && v.trim() ? v.trim() : undefined;
      let b64 =
        pick(json.base64) ||
        (json.data && typeof json.data === "object"
          ? pick((json.data as Record<string, unknown>).base64)
          : undefined) ||
        pick((json as { result?: { base64?: string } }).result?.base64);
      if (!b64) return null;
      const mimetype =
        pick(json.mimetype) ||
        (json.data && typeof json.data === "object"
          ? pick((json.data as Record<string, unknown>).mimetype as string)
          : undefined);
      return { base64: b64, mimetype };
    } catch {
      return null;
    }
  }

  private async fetchContactProfile(
    digits: string,
  ): Promise<{ name?: string; photoUrl?: string | null } | null> {
    const base = this.config.baseUrl.replace(/\/$/, "");
    const encodedInstance = encodeURIComponent(this.config.instanceName);
    const url = `${base}/chat/fetchProfile/${encodedInstance}`;

    const candidatesNumbers = [
      digits,
      `+${digits}`,
      `${digits}@s.whatsapp.net`,
    ];

    for (const number of candidatesNumbers) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ number }),
        });
        if (!res.ok) continue;

        const json = (await res.json().catch(() => ({}))) as unknown;
        const name = extractFirstStringByKeys(json, [
          "name",
          "pushName",
          "pushname",
          "notifyName",
          "notify",
          "profileName",
          "profile",
          "businessProfileName",
          "formattedName",
        ]);
        const photoUrl = extractFirstHttpUrl(json) ?? null;
        return { name, photoUrl };
      } catch {
        // try next candidate number
      }
    }

    return null;
  }

  private async fetchProfilePictureUrl(digits: string): Promise<string | null> {
    const base = this.config.baseUrl.replace(/\/$/, "");
    const encodedInstance = encodeURIComponent(this.config.instanceName);
    const paths = [
      `${base}/chat/fetchProfilePictureUrl/${encodedInstance}`,
      `${base}/chat/profilePictureUrl/${encodedInstance}`,
    ];
    const getPaths = [
      `${base}/chat/fetchProfilePictureUrl/${encodedInstance}?number=${encodeURIComponent(digits)}`,
      `${base}/chat/profilePictureUrl/${encodedInstance}?number=${encodeURIComponent(digits)}`,
    ];

    for (const url of paths) {
      const attempts: Array<Record<string, unknown>> = [
        { number: digits },
        { number: `+${digits}` },
        { number: `${digits}@s.whatsapp.net` },
        { jid: `${digits}@s.whatsapp.net` },
      ];
      for (const body of attempts) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
          });
          if (!res.ok) continue;
          const json = (await res.json().catch(() => ({}))) as unknown;
          const extracted = extractFirstHttpUrl(json);
          if (extracted) return extracted;
        } catch {
          // ignore and try next endpoint/payload variation
        }
      }
    }

    for (const url of getPaths) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { apikey: this.config.apiKey },
        });
        if (!res.ok) continue;
        const json = (await res.json().catch(() => ({}))) as unknown;
        const extracted = extractFirstHttpUrl(json);
        if (extracted) return extracted;
      } catch {
        // ignore and try next endpoint variation
      }
    }

    return null;
  }
}

/** Evolution envia `event: "messages.upsert"`; ignorar outros para não tratar `data` de CONNECTION_UPDATE como mensagem. */
function evolutionEventIsMessagesUpsert(payload: Record<string, unknown>): boolean {
  const ev = payload.event;
  if (ev == null) return true;
  if (typeof ev !== "string") return true;
  const n = ev.trim().replace(/[.-]/g, "_").toUpperCase();
  return n === "MESSAGES_UPSERT";
}

function normalizeMessagesArray(
  messages: unknown,
): Record<string, unknown>[] {
  if (messages == null) return [];
  if (Array.isArray(messages)) {
    return messages.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }
  if (typeof messages === "object") {
    return Object.values(messages).filter(
      (x) => x && typeof x === "object",
    ) as Record<string, unknown>[];
  }
  return [];
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

function extractMessageBlobs(payload: unknown): Record<string, unknown>[] {
  let p = payload as Record<string, unknown>;

  // Proxies às vezes mandam `body` como JSON string ou objeto vazio; não substituir
  // o payload inteiro por um `body` que não tem `data`/`event` (isso apagava `data` do topo).
  const bodyRaw = p.body;
  if (typeof bodyRaw === "string") {
    const parsed = tryParseJsonObject(bodyRaw.trim());
    if (
      parsed &&
      (parsed.data != null ||
        (typeof parsed.event === "string" && parsed.event.trim().length > 0))
    ) {
      p = parsed;
    }
  } else if (bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw)) {
    const b = bodyRaw as Record<string, unknown>;
    const bodyLooksLikeWebhook =
      b.data != null ||
      (typeof b.event === "string" && b.event.trim().length > 0);
    if (bodyLooksLikeWebhook) {
      p = b;
    }
  }

  if (!evolutionEventIsMessagesUpsert(p)) {
    return [];
  }

  let d: unknown = p.data;
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
      const fromMessages = normalizeMessagesArray(inner.messages);
      if (fromMessages.length > 0) return fromMessages;
    }
    return [inner];
  }

  if (p.key && p.message) {
    return [p];
  }

  return [];
}

/** Diagnóstico no webhook (ngrok): blobs extraídos vs mensagens normalizadas. */
export function getEvolutionWebhookParseMeta(payload: unknown): {
  event: unknown;
  blobCount: number;
} {
  const p = payload as Record<string, unknown>;
  return {
    event: p.event,
    blobCount: extractMessageBlobs(payload).length,
  };
}

function parseTimestamp(raw: unknown): Date {
  const n = Number(raw);
  if (!Number.isFinite(n)) return new Date();
  // Baileys / Evolution usam segundos em vários casos; JS usa ms.
  if (n > 0 && n < 1e12) return new Date(n * 1000);
  return new Date(n);
}

/** Desembrulha viewOnce / ephemeral / documentWithCaption (Baileys) até o nó com conversation ou tipos conhecidos. */
function unwrapProtoContent(
  message: Record<string, unknown> | undefined,
  depth = 0,
): Record<string, unknown> | undefined {
  if (!message || depth > 10) return message;

  const wrapKeys = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
  ] as const;
  for (const k of wrapKeys) {
    const wrap = message[k] as Record<string, unknown> | undefined;
    const inner = wrap?.message;
    if (inner && typeof inner === "object") {
      return unwrapProtoContent(inner as Record<string, unknown>, depth + 1);
    }
  }

  const dwc = message.documentWithCaptionMessage as
    | Record<string, unknown>
    | undefined;
  const dm = dwc?.message as Record<string, unknown> | undefined;
  if (dm && typeof dm === "object") {
    return unwrapProtoContent(dm, depth + 1);
  }

  const edited = message.editedMessage as Record<string, unknown> | undefined;
  const em = edited?.message as Record<string, unknown> | undefined;
  if (em && typeof em === "object") {
    return unwrapProtoContent(em, depth + 1);
  }

  return message;
}

function extractTextFromMessage(
  message: Record<string, unknown> | undefined,
): string {
  const root = unwrapProtoContent(message);
  if (!root) return "";

  const ext = root.extendedTextMessage as
    | Record<string, unknown>
    | undefined;
  const img = root.imageMessage as Record<string, unknown> | undefined;
  const vid = root.videoMessage as Record<string, unknown> | undefined;
  const doc = root.documentMessage as Record<string, unknown> | undefined;
  const btn = root.buttonsResponseMessage as
    | Record<string, unknown>
    | undefined;
  const list = root.listResponseMessage as
    | Record<string, unknown>
    | undefined;
  const aud = root.audioMessage as Record<string, unknown> | undefined;
  const ptt = root.pttMessage as Record<string, unknown> | undefined;
  const tmpl = root.templateMessage as Record<string, unknown> | undefined;
  const hydrated = tmpl?.hydratedTemplate as Record<string, unknown> | undefined;
  const interactive = root.interactiveMessage as
    | Record<string, unknown>
    | undefined;
  const intBody = interactive?.body as Record<string, unknown> | undefined;
  const intHeader = interactive?.header as Record<string, unknown> | undefined;
  const tplBtn = root.templateButtonReplyMessage as
    | Record<string, unknown>
    | undefined;
  const buttonsMsg = root.buttonsMessage as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    root.conversation,
    ext?.text,
    img?.caption,
    vid?.caption,
    doc?.caption,
    aud?.caption,
    btn?.selectedDisplayText,
    list?.title,
    typeof list?.singleSelectReply === "object" && list.singleSelectReply
      ? (list.singleSelectReply as Record<string, unknown>).selectedRowId
      : undefined,
    hydrated?.hydratedTitleText,
    hydrated?.hydratedContentText,
    intBody?.text,
    intBody?.title,
    intHeader?.title,
    intHeader?.subtitle,
    interactive?.contentText,
    tplBtn?.selectedDisplayText,
    tplBtn?.selectedId,
    buttonsMsg?.contentText,
    buttonsMsg?.text,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  if (root.imageMessage || root.videoMessage || root.stickerMessage) {
    return "[Mídia]";
  }
  if (root.audioMessage || ptt) return "[Áudio]";
  if (root.documentMessage) return "[Documento]";
  return "";
}

/** Mídia no webhook (áudio, imagem, PDF) quando a Evolution envia base64 no payload. */
function extractWebhookMediaPayload(
  data: Record<string, unknown>,
  message: Record<string, unknown> | undefined,
): { mediaUrl: string | null; mediaType: string | null } {
  const root = unwrapProtoContent(message);
  if (!root) return { mediaUrl: null, mediaType: null };

  const aud = (root.audioMessage ?? root.pttMessage) as
    | Record<string, unknown>
    | undefined;
  const img = root.imageMessage as Record<string, unknown> | undefined;
  const doc = root.documentMessage as Record<string, unknown> | undefined;

  const node = aud ?? img ?? doc;
  if (!node) return { mediaUrl: null, mediaType: null };

  const mimeRaw =
    typeof node.mimetype === "string"
      ? node.mimetype
      : aud
        ? "audio/ogg; codecs=opus"
        : img
          ? "image/jpeg"
          : "application/pdf";
  const mime = mimeRaw.split(";")[0]?.trim() || "application/octet-stream";

  const msgRec = message as Record<string, unknown> | undefined;
  const b64Raw =
    (typeof data.base64 === "string" && data.base64) ||
    (typeof data.messageBase64 === "string" && data.messageBase64) ||
    (typeof data.mediaBase64 === "string" && data.mediaBase64) ||
    (msgRec && typeof msgRec.base64 === "string" && msgRec.base64) ||
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

function parseOneEvolutionMessage(data: Record<string, unknown>): {
  externalId: string;
  whatsappKeyId?: string;
  from: string;
  body: string;
  timestamp: Date;
  profileName?: string;
  profilePhotoUrl?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  fromMe: boolean;
  debug?: {
    remoteJid?: string;
    participant?: string;
  };
} | null {
  const key = data.key as Record<string, unknown> | undefined;
  if (!key) return null;

  const remoteJid = String(key.remoteJid ?? "");
  const participant = String(key.participant ?? "");
  if (!remoteJid) return null;
  if (remoteJid.includes("status@broadcast")) return null;

  // Não varrer o JSON inteiro por @g.us: contexto citado de grupo em chat 1:1 gerava falso positivo.

  // Evolution payload sometimes marks groups without remoteJid ending in @g.us.
  // In these cases, key.participant usually exists and contains @g.us.
  const isGroupLike = remoteJid.includes("@g.us") || participant.includes("@g.us");
  if (isGroupLike && !ALLOW_GROUPS) return null;

  // Inbox MVP: defaults to 1:1 only; groups can be enabled by env flag.
  if (!isSupportedChatJid(remoteJid)) return null;

  const localPart = remoteJid.split("@")[0] ?? "";
  if (!localPart) return null;
  /** JIDs @lid não trazem número no localPart (WhatsApp multicanal). */
  const from = remoteJid.endsWith("@lid")
    ? `lid:${localPart}`
    : localPart;
  if (!remoteJid.endsWith("@lid") && !localPart.replace(/\D/g, "")) {
    return null;
  }

  const rawMsg =
    data.message ?? data.msg ?? (data as { fullMessage?: unknown }).fullMessage;
  let message: Record<string, unknown> | undefined;
  if (rawMsg && typeof rawMsg === "object" && !Array.isArray(rawMsg)) {
    message = rawMsg as Record<string, unknown>;
  } else if (typeof rawMsg === "string" && rawMsg.trim()) {
    const parsed = tryParseJsonObject(rawMsg.trim());
    if (parsed) message = parsed;
  }
  const text = extractTextFromMessage(message);
  if (!text) return null;

  const id = String(key.id ?? "");
  const fromMe = key.fromMe === true;

  const media = extractWebhookMediaPayload(data, message);
  const tsRaw =
    data.messageTimestamp ?? data.timestamp ?? (key as { t?: unknown }).t;

  return {
    externalId: id || `${from}-${Date.now()}`,
    whatsappKeyId: id || undefined,
    from,
    body: text,
    timestamp: parseTimestamp(tsRaw),
    profileName: extractProfileName(data, key),
    profilePhotoUrl: extractProfilePhotoUrl(data),
    mediaUrl: media.mediaUrl,
    mediaType: media.mediaType,
    fromMe,
    debug: {
      remoteJid,
      participant: participant || undefined,
    },
  };
}

function isDirectChatJid(remoteJid: string): boolean {
  return (
    remoteJid.endsWith("@s.whatsapp.net") ||
    remoteJid.endsWith("@c.us") ||
    remoteJid.endsWith("@lid")
  );
}

function isGroupChatJid(remoteJid: string): boolean {
  return remoteJid.endsWith("@g.us");
}

function isSupportedChatJid(remoteJid: string): boolean {
  if (isDirectChatJid(remoteJid)) return true;
  if (isGroupChatJid(remoteJid)) return ALLOW_GROUPS;
  return false;
}

function extractProfileName(
  data: Record<string, unknown>,
  key: Record<string, unknown>,
): string | undefined {
  const candidates: unknown[] = [
    data.pushName,
    data.pushname,
    data.notifyName,
    data.notify,
    key.pushName,
    key.pushname,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

function extractProfilePhotoUrl(data: Record<string, unknown>): string | undefined {
  const candidates: unknown[] = [
    data.profilePicUrl,
    data.profilePictureUrl,
    data.picture,
    data.photoUrl,
    (data.sender as Record<string, unknown> | undefined)?.profilePicUrl,
    (data.sender as Record<string, unknown> | undefined)?.profilePictureUrl,
    (data.sender as Record<string, unknown> | undefined)?.photoUrl,
    (data.contact as Record<string, unknown> | undefined)?.profilePicUrl,
    (data.contact as Record<string, unknown> | undefined)?.profilePictureUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c.trim())) {
      return c.trim();
    }
  }
  return undefined;
}

function extractFirstHttpUrl(payload: unknown): string | null {
  const visit = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === "string") {
      const v = value.trim();
      if (v.startsWith("http://") || v.startsWith("https://")) return v;
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) {
        const found = visit(item);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(payload);
}

function extractFirstStringByKeys(
  payload: unknown,
  keys: string[],
): string | undefined {
  const keySet = new Set(keys);
  const visit = (value: unknown): string | undefined => {
    if (value == null) return undefined;
    if (typeof value === "string") return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (keySet.has(k) && typeof v === "string" && v.trim()) return v.trim();
        const found = visit(v);
        if (found) return found;
      }
    }
    return undefined;
  };

  return visit(payload);
}

/** Níveis de ACK para mensagens enviadas (outbound), extraídos de `messages.update` na Evolution. */
export type EvolutionMessageAckLevel = "sent" | "delivered" | "read";

function evolutionEventIsMessagesUpdate(payload: Record<string, unknown>): boolean {
  const ev = payload.event;
  if (ev == null) return false;
  if (typeof ev !== "string") return false;
  const n = ev.trim().replace(/[.-]/g, "_").toUpperCase();
  return n === "MESSAGES_UPDATE";
}

function mapRawAckToLevel(statusRaw: unknown): EvolutionMessageAckLevel {
  if (typeof statusRaw === "string") {
    const s = statusRaw.toUpperCase();
    if (
      s.includes("READ") ||
      s.includes("PLAYED") ||
      s === "4" ||
      s === "5"
    ) {
      return "read";
    }
    if (
      s.includes("DELIV") ||
      s.includes("DEVICE") ||
      s.includes("RECEIPT") ||
      s === "3"
    ) {
      return "delivered";
    }
    return "sent";
  }
  const n = Number(statusRaw);
  if (!Number.isFinite(n)) return "delivered";
  if (n >= 4) return "read";
  if (n >= 3) return "delivered";
  return "sent";
}

/**
 * Extrai atualizações de status (ACK) de webhooks `messages.update`.
 * Só aplica a mensagens OUTBOUND gravadas com o mesmo `externalId`.
 */
export function extractEvolutionMessageAckUpdates(payload: unknown): {
  externalId: string;
  level: EvolutionMessageAckLevel;
}[] {
  if (payload == null || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  if (!evolutionEventIsMessagesUpdate(p)) return [];

  const byId = new Map<string, EvolutionMessageAckLevel>();
  const rank = (l: EvolutionMessageAckLevel) =>
    l === "read" ? 3 : l === "delivered" ? 2 : 1;
  const merge = (
    a: EvolutionMessageAckLevel,
    b: EvolutionMessageAckLevel,
  ): EvolutionMessageAckLevel => (rank(b) > rank(a) ? b : a);

  const push = (
    externalId: string,
    statusRaw: unknown,
    fromMe?: unknown,
  ) => {
    if (fromMe === false) return;
    const id = String(externalId).trim();
    if (!id) return;
    const level = mapRawAckToLevel(statusRaw);
    const prev = byId.get(id);
    byId.set(id, prev ? merge(prev, level) : level);
  };

  const visit = (row: Record<string, unknown>) => {
    const key = row.key as Record<string, unknown> | undefined;
    const fromMe = key?.fromMe ?? row.fromMe;
    const id =
      (typeof key?.id === "string" && key.id) ||
      (typeof row.keyId === "string" && row.keyId) ||
      (typeof row.messageId === "string" && row.messageId) ||
      (typeof row.id === "string" && row.id);
    const update = row.update as Record<string, unknown> | undefined;
    const status = update?.status ?? row.status ?? row.ack;
    if (id != null && id !== "" && status !== undefined && status !== null) {
      push(String(id), status, fromMe);
    }
  };

  const data = p.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") visit(item as Record<string, unknown>);
    }
  } else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.messages)) {
      for (const item of d.messages) {
        if (item && typeof item === "object")
          visit(item as Record<string, unknown>);
      }
    } else {
      visit(d);
    }
  }

  return [...byId.entries()].map(([externalId, level]) => ({
    externalId,
    level,
  }));
}
