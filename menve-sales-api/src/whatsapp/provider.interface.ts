export type NormalizedInbound = {
  externalId: string;
  /** `key.id` do WhatsApp; ausente quando o webhook não trouxe id (não dá para buscar mídia na Evolution). */
  whatsappKeyId?: string;
  from: string;
  body: string;
  timestamp: Date;
  profileName?: string;
  profilePhotoUrl?: string;
  /** Data URL ou URL pública quando o webhook inclui base64. */
  mediaUrl?: string | null;
  mediaType?: string | null;
  /**
   * Evolution: `key.fromMe` — mensagem enviada pelo número conectado (app web ou celular).
   * Quando true, gravamos como OUTBOUND; dedupe por `externalId` evita duplicar envio pelo Inbox.
   */
  fromMe?: boolean;
  debug?: {
    remoteJid?: string;
    participant?: string;
  };
};

/** Envio outbound de áudio / imagem / PDF (base64 ou data URL no provider). */
export type OutboundMediaKind = "audio" | "image" | "document";

export type SendOutboundMediaInput = {
  to: string;
  kind: OutboundMediaKind;
  /** Base64 cru (sem prefixo data:) */
  base64: string;
  mimeType: string;
  fileName?: string;
  caption?: string;
};

export interface IWhatsAppProvider {
  sendTextMessage(
    to: string,
    text: string,
  ): Promise<{ ok: boolean; externalId?: string; error?: string }>;

  /** Opcional: canais que suportam mídia outbound (Evolution, Meta). */
  sendOutboundMedia?(
    input: SendOutboundMediaInput,
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
  ): Promise<{ ok: boolean; externalId?: string; error?: string }>;

  getConnectionStatus(): Promise<{ connected: boolean; detail?: string }>;

  getContactProfile?(
    phone: string,
  ): Promise<{ name?: string; photoUrl?: string | null }>;

  /** Converte payload bruto do webhook em mensagens normalizadas */
  parseWebhook(payload: unknown): NormalizedInbound[];

  /** Evolution: baixa base64 do áudio/vídeo pelo par key + remoteJid após o webhook. */
  fetchInboundMediaBase64?(args: {
    keyId: string;
    remoteJid: string;
  }): Promise<{ base64: string; mimetype?: string } | null>;
}
