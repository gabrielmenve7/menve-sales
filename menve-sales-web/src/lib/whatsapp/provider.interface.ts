export type NormalizedInbound = {
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

  getContactProfile?(
    phone: string,
  ): Promise<{ name?: string; photoUrl?: string | null }>;

  /** Converte payload bruto do webhook em mensagens normalizadas */
  parseWebhook(payload: unknown): NormalizedInbound[];
}
