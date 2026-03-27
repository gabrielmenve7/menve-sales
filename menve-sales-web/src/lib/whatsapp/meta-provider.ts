import type { IWhatsAppProvider, NormalizedInbound } from "./provider.interface";

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
