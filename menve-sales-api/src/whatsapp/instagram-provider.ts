import type { IWhatsAppProvider, NormalizedInbound } from "./provider.interface";

/**
 * Stub provider for Instagram Messenger API.
 * TODO: Implement actual Graph API integration for sending/receiving DMs.
 */
export class InstagramProvider implements IWhatsAppProvider {
  constructor(
    private readonly config: {
      pageId: string;
      accessToken: string;
      igUserId: string;
    },
  ) {}

  async sendTextMessage(
    to: string,
    text: string,
  ): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    // TODO: POST https://graph.facebook.com/v19.0/me/messages with page access token
    return {
      ok: false,
      error: "Instagram sending not yet implemented",
    };
  }

  async getConnectionStatus(): Promise<{
    connected: boolean;
    detail?: string;
  }> {
    return { connected: true, detail: "stub" };
  }

  parseWebhook(_payload: unknown): NormalizedInbound[] {
    // TODO: Parse Instagram webhook payload from Meta Graph API
    return [];
  }
}
