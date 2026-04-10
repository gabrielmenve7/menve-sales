import type {
  IWhatsAppProvider,
  NormalizedInbound,
  SendOutboundMediaInput,
} from "./provider.interface";

type MetaConfig = {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
};

export class MetaWhatsAppProvider implements IWhatsAppProvider {
  constructor(private readonly config: MetaConfig) {}

  private base() {
    return `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}`;
  }

  async sendTextMessage(to: string, text: string) {
    try {
      const res = await fetch(`${this.base()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/\D/g, ""),
          type: "text",
          text: { body: text },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
      };
      if (!res.ok) {
        return { ok: false, error: JSON.stringify(json) };
      }
      return { ok: true, externalId: json.messages?.[0]?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  private async uploadMediaToMeta(
    base64: string,
    mimeType: string,
    fileName: string,
  ): Promise<{ id: string } | { error: string }> {
    let raw = base64.trim();
    const dataPrefix = /^data:[^;]+;base64,/i.exec(raw);
    if (dataPrefix) {
      raw = raw.slice(dataPrefix[0].length);
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      return { error: "Base64 inválido" };
    }
    if (buffer.length < 16) return { error: "Arquivo vazio ou inválido" };
    if (buffer.length > 16 * 1024 * 1024) {
      return { error: "Arquivo acima de 16MB" };
    }

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    form.append("file", blob, fileName);

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/media`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
          body: form,
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!res.ok || !json.id) {
        return {
          error:
            json.error?.message ??
            `Upload mídia Meta HTTP ${res.status}: ${JSON.stringify(json)}`,
        };
      }
      return { id: json.id };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erro upload Meta" };
    }
  }

  async sendOutboundMedia(input: SendOutboundMediaInput) {
    const to = input.to.replace(/\D/g, "");
    const fileName =
      input.fileName?.trim() ||
      (input.kind === "audio"
        ? "audio.webm"
        : input.kind === "image"
          ? "image.jpg"
          : "documento.pdf");

    const uploaded = await this.uploadMediaToMeta(
      input.base64,
      input.mimeType,
      fileName,
    );
    if ("error" in uploaded) {
      return { ok: false, error: uploaded.error };
    }
    const mediaId = uploaded.id;

    let type: string;
    let payload: Record<string, unknown>;
    if (input.kind === "audio") {
      type = "audio";
      payload = { audio: { id: mediaId } };
    } else if (input.kind === "image") {
      type = "image";
      payload = {
        image: {
          id: mediaId,
          ...(input.caption?.trim()
            ? { caption: input.caption.trim() }
            : {}),
        },
      };
    } else {
      type = "document";
      payload = {
        document: {
          id: mediaId,
          filename: fileName,
          ...(input.caption?.trim()
            ? { caption: input.caption.trim() }
            : {}),
        },
      };
    }

    try {
      const res = await fetch(`${this.base()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type,
          ...payload,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          ok: false,
          error:
            json.error?.message ??
            `Meta send media HTTP ${res.status}: ${JSON.stringify(json)}`,
        };
      }
      return { ok: true, externalId: json.messages?.[0]?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    language: string,
    components?: unknown[],
  ) {
    try {
      const res = await fetch(`${this.base()}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/\D/g, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: components ?? [],
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
      };
      if (!res.ok) {
        return { ok: false, error: JSON.stringify(json) };
      }
      return { ok: true, externalId: json.messages?.[0]?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro" };
    }
  }

  async getConnectionStatus() {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}?fields=verified_name,display_phone_number`,
        { headers: { Authorization: `Bearer ${this.config.accessToken}` } },
      );
      return { connected: res.ok, detail: res.ok ? "ok" : `HTTP ${res.status}` };
    } catch (e) {
      return {
        connected: false,
        detail: e instanceof Error ? e.message : "Erro",
      };
    }
  }

  parseWebhook(payload: unknown): NormalizedInbound[] {
    const body = payload as {
      entry?: {
        changes?: {
          value?: {
            messages?: MetaWebhookMessage[];
          };
        }[];
      }[];
    };
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return [];
    const out: NormalizedInbound[] = [];
    for (const m of messages) {
      const normalized = normalizeMetaInboundMessage(m);
      if (normalized) out.push(normalized);
    }
    return out;
  }
}

type MetaWebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string; mime_type?: string; id?: string };
  video?: { caption?: string; mime_type?: string; id?: string };
  audio?: { mime_type?: string; id?: string };
  document?: {
    caption?: string;
    filename?: string;
    mime_type?: string;
    id?: string;
  };
  sticker?: { mime_type?: string; id?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
};

function normalizeMetaInboundMessage(
  m: MetaWebhookMessage,
): NormalizedInbound | null {
  const externalId = m.id ?? "";
  const from = m.from ?? "";
  if (!externalId || !from) return null;
  const ts = new Date(Number(m.timestamp ?? 0) * 1000);
  const type = (m.type ?? "text").toLowerCase();

  if (type === "text" && m.text?.body) {
    return { externalId, from, body: m.text.body, timestamp: ts };
  }

  if (type === "image") {
    const cap = m.image?.caption?.trim();
    return {
      externalId,
      from,
      body: cap || "[Imagem recebida]",
      timestamp: ts,
      mediaType: m.image?.mime_type ?? "image/*",
    };
  }

  if (type === "video") {
    const cap = m.video?.caption?.trim();
    return {
      externalId,
      from,
      body: cap || "[Vídeo recebido]",
      timestamp: ts,
      mediaType: m.video?.mime_type ?? "video/*",
    };
  }

  if (type === "audio") {
    return {
      externalId,
      from,
      body: "[Áudio recebido]",
      timestamp: ts,
      mediaType: m.audio?.mime_type ?? "audio/*",
    };
  }

  if (type === "document") {
    const name = m.document?.filename?.trim();
    const cap = m.document?.caption?.trim();
    const label = [cap, name].filter(Boolean).join(" — ");
    return {
      externalId,
      from,
      body: label || "[Documento recebido]",
      timestamp: ts,
      mediaType: m.document?.mime_type ?? "application/octet-stream",
    };
  }

  if (type === "sticker") {
    return {
      externalId,
      from,
      body: "[Figurinha]",
      timestamp: ts,
      mediaType: m.sticker?.mime_type ?? "image/webp",
    };
  }

  if (type === "interactive" && m.interactive) {
    const ir = m.interactive;
    if (ir.type === "button_reply" && ir.button_reply?.title) {
      return {
        externalId,
        from,
        body: ir.button_reply.title,
        timestamp: ts,
      };
    }
    if (ir.type === "list_reply" && ir.list_reply?.title) {
      const desc = ir.list_reply.description?.trim();
      const title = ir.list_reply.title;
      return {
        externalId,
        from,
        body: desc ? `${title} — ${desc}` : title,
        timestamp: ts,
      };
    }
  }

  if (m.text?.body) {
    return { externalId, from, body: m.text.body, timestamp: ts };
  }

  return null;
}
