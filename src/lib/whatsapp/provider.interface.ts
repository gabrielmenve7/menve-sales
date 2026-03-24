export type NormalizedInbound = {
  externalId: string;
  from: string;
  body: string;
  timestamp: Date;
};

export interface IWhatsAppProvider {
  sendTextMessage(
    to: string,
    text: string,
  ): Promise<{ ok: boolean; externalId?: string; error?: string }>;

  sendMediaMessage?(
    to: string,
    media: { url: string; caption?: string },
  ): Promise<{ ok: boolean; error?: string }>;

  sendTemplate?(
    to: string,
    templateName: string,
    language: string,
    components?: unknown[],
  ): Promise<{ ok: boolean; error?: string }>;

  getConnectionStatus(): Promise<{ connected: boolean; detail?: string }>;

  /** Converte payload bruto do webhook em mensagens normalizadas */
  parseWebhook(payload: unknown): NormalizedInbound[];
}
