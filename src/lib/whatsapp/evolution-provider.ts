import type { IWhatsAppProvider, NormalizedInbound } from "./provider.interface";

type EvolutionConfig = {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
};

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

  parseWebhook(payload: unknown): NormalizedInbound[] {
    const out: NormalizedInbound[] = [];
    for (const data of extractMessageBlobs(payload)) {
      const parsed = parseOneEvolutionMessage(data);
      if (parsed) out.push(parsed);
    }
    return out;
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
} | null {
  const key = data.key as Record<string, unknown> | undefined;
  if (!key) return null;

  const remoteJid = String(key.remoteJid ?? "");
  if (!remoteJid || remoteJid.includes("status@broadcast")) return null;

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
  };
}
