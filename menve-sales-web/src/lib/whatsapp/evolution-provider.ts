import type { IWhatsAppProvider, NormalizedInbound } from "./provider.interface";

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
    const out: NormalizedInbound[] = [];
    for (const data of extractMessageBlobs(payload)) {
      const parsed = parseOneEvolutionMessage(data);
      if (parsed) out.push(parsed);
    }
    return out;
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

function extractMessageBlobs(payload: unknown): Record<string, unknown>[] {
  const p = payload as Record<string, unknown>;
  const d = p.data;

  if (Array.isArray(d)) {
    return d.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }

  if (d && typeof d === "object") {
    const inner = d as Record<string, unknown>;
    if (Array.isArray(inner.messages)) {
      return inner.messages.filter(
        (x) => x && typeof x === "object",
      ) as Record<string, unknown>[];
    }
    return [inner];
  }

  if (p.key && p.message) {
    return [p];
  }

  return [];
}

function parseTimestamp(raw: unknown): Date {
  const n = Number(raw);
  if (!Number.isFinite(n)) return new Date();
  // Baileys / Evolution usam segundos em vários casos; JS usa ms.
  if (n > 0 && n < 1e12) return new Date(n * 1000);
  return new Date(n);
}

function extractTextFromMessage(
  message: Record<string, unknown> | undefined,
): string {
  if (!message) return "";

  const ext = message.extendedTextMessage as
    | Record<string, unknown>
    | undefined;
  const img = message.imageMessage as Record<string, unknown> | undefined;
  const vid = message.videoMessage as Record<string, unknown> | undefined;
  const doc = message.documentMessage as Record<string, unknown> | undefined;
  const btn = message.buttonsResponseMessage as
    | Record<string, unknown>
    | undefined;
  const list = message.listResponseMessage as
    | Record<string, unknown>
    | undefined;
  const aud = message.audioMessage as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    message.conversation,
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
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  if (message.imageMessage || message.videoMessage || message.stickerMessage) {
    return "[Mídia]";
  }
  if (message.audioMessage) return "[Áudio]";
  if (message.documentMessage) return "[Documento]";
  return "";
}

function parseOneEvolutionMessage(data: Record<string, unknown>): {
  externalId: string;
  from: string;
  body: string;
  timestamp: Date;
  profileName?: string;
  profilePhotoUrl?: string;
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

  if (!ALLOW_GROUPS && payloadContainsGroupJid(data)) return null;

  // Evolution payload sometimes marks groups without remoteJid ending in @g.us.
  // In these cases, key.participant usually exists and contains @g.us.
  const isGroupLike = remoteJid.includes("@g.us") || participant.includes("@g.us");
  if (isGroupLike && !ALLOW_GROUPS) return null;

  // Inbox MVP: defaults to 1:1 only; groups can be enabled by env flag.
  if (!isSupportedChatJid(remoteJid)) return null;

  const from = remoteJid.split("@")[0] ?? "";
  if (!from.replace(/\D/g, "")) return null;

  const message = data.message as Record<string, unknown> | undefined;
  const text = extractTextFromMessage(message);
  if (!text) return null;

  const id = String(key.id ?? "");
  if (key.fromMe === true) {
    // Outbound já tratado pelo app ou eco; ignorar evita duplicar no inbox.
    return null;
  }

  return {
    externalId: id || `${from}-${Date.now()}`,
    from,
    body: text,
    timestamp: parseTimestamp(data.messageTimestamp),
    profileName: extractProfileName(data, key),
    profilePhotoUrl: extractProfilePhotoUrl(data),
    debug: {
      remoteJid,
      participant: participant || undefined,
    },
  };
}

function payloadContainsGroupJid(payload: unknown): boolean {
  const needle = "@g.us";
  const maxDepth = 6;
  const seen = new Set<unknown>();

  const visit = (value: unknown, depth: number): boolean => {
    if (depth > maxDepth) return false;
    if (value == null) return false;
    if (typeof value === "string") {
      return value.includes(needle);
    }
    if (typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        if (visit(item, depth + 1)) return true;
      }
      return false;
    }

    for (const v of Object.values(value as Record<string, unknown>)) {
      if (visit(v, depth + 1)) return true;
    }
    return false;
  };

  return visit(payload, 0);
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
