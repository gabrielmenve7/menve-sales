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
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        return { ok: false, error: JSON.stringify(json) };
      }
      return { ok: true };
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
            messages?: {
              id?: string;
              from?: string;
              text?: { body?: string };
              timestamp?: string;
            }[];
          };
        }[];
      }[];
    };
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return [];
    return messages
      .filter((m) => m.text?.body)
      .map((m) => ({
        externalId: m.id ?? "",
        from: m.from ?? "",
        body: m.text?.body ?? "",
        timestamp: new Date(Number(m.timestamp ?? 0) * 1000),
      }));
  }
}
