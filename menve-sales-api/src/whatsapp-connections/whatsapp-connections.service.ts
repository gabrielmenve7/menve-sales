import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { createWhatsAppProvider } from "../whatsapp/factory";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  fetchEvolutionConnectionState,
  getEvolutionEnv,
  getPairingQrDataUrl,
  setEvolutionInstanceWebhook,
} from "../whatsapp/evolution-admin";

const META_GRAPH_VERSION = "v21.0";

async function assertMetaGraphPhoneAccess(
  phoneNumberId: string,
  accessToken: string,
) {
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg =
      json.error?.message ??
      `Graph API HTTP ${res.status} ao validar Phone Number ID`;
    throw new BadRequestException(
      `Credenciais Meta inválidas ou sem permissão: ${msg}`,
    );
  }
}

function appPublicUrl() {
  const u =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return u || "";
}

function buildWebhookHeaders(): Record<string, string> | undefined {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (!secret) return undefined;
  return { "x-webhook-secret": secret };
}

type EvolutionConnConfig = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
};

function parseEvolutionConfig(raw: unknown): EvolutionConnConfig | null {
  const c = raw as Record<string, unknown>;
  const baseUrl = String(c.baseUrl ?? "");
  const apiKey = String(c.apiKey ?? "");
  const instanceName = String(c.instanceName ?? "");
  if (!baseUrl || !apiKey || !instanceName) return null;
  return { baseUrl, apiKey, instanceName };
}

@Injectable()
export class WhatsappConnectionsService {
  private readonly log = new Logger(WhatsappConnectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  webhookPath(connectionId: string) {
    const base = appPublicUrl();
    if (!base) return "";
    return `${base}/webhooks/whatsapp/evolution/${connectionId}`;
  }

  async startPairing(u: RequestUser, input?: { name?: string }) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const appUrl = appPublicUrl();
    if (!appUrl) {
      throw new BadRequestException(
        "Configure PUBLIC_APP_URL ou NEXT_PUBLIC_APP_URL para o webhook.",
      );
    }
    const { baseUrl, apiKey } = getEvolutionEnv();
    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        tenantId,
        name: input?.name?.trim() || "WhatsApp",
        provider: "EVOLUTION",
        isActive: false,
        config: { baseUrl, apiKey, instanceName: "" },
      },
    });
    const instanceName = `menve${connection.id.replace(/-/g, "")}`.slice(0, 60);
    const webhookUrl = `${appUrl}/webhooks/whatsapp/evolution/${connection.id}`;
    try {
      await deleteEvolutionInstance({
        baseUrl,
        apiKey,
        instanceName,
      }).catch(() => {});
      const createRes = await createEvolutionInstance({
        baseUrl,
        apiKey,
        instanceName,
        webhookUrl,
        webhookHeaders: buildWebhookHeaders(),
      });
      await this.prisma.whatsAppConnection.update({
        where: { id: connection.id },
        data: {
          config: { baseUrl, apiKey, instanceName },
        },
      });
      const qrDataUrl = await getPairingQrDataUrl({
        baseUrl,
        apiKey,
        instanceName,
        createResponse: createRes,
      });
      if (!qrDataUrl) {
        throw new BadRequestException(
          "Não foi possível obter o QR Code. Tente recarregar.",
        );
      }
      return { ok: true as const, connectionId: connection.id, qrDataUrl };
    } catch (e) {
      await this.prisma.whatsAppConnection
        .delete({ where: { id: connection.id } })
        .catch(() => {});
      throw this.wrapEvolutionError(e, "Falha ao parear com a Evolution API");
    }
  }

  async refreshQr(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId, provider: "EVOLUTION" },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");
    const cfg = parseEvolutionConfig(conn.config);
    if (!cfg) throw new BadRequestException("Configuração inválida");
    let qrDataUrl: string | null;
    try {
      qrDataUrl = await getPairingQrDataUrl({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: cfg.instanceName,
      });
    } catch (e) {
      throw this.wrapEvolutionError(e, "Falha ao recarregar QR");
    }
    if (!qrDataUrl) {
      throw new BadRequestException("Não foi possível obter um novo QR Code.");
    }
    return { ok: true as const, qrDataUrl };
  }

  async pollStatus(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId, provider: "EVOLUTION" },
    });
    if (!conn) return { ok: false as const, error: "not_found" as const };
    const cfg = parseEvolutionConfig(conn.config);
    if (!cfg) return { ok: false as const, error: "invalid_config" as const };
    const state = await fetchEvolutionConnectionState({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      instanceName: cfg.instanceName,
    });
    const appUrl = appPublicUrl();
    if (state.connected && appUrl && !conn.isActive) {
      await setEvolutionInstanceWebhook({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: cfg.instanceName,
        webhookUrl: `${appUrl}/webhooks/whatsapp/evolution/${conn.id}`,
        webhookHeaders: buildWebhookHeaders(),
      }).catch((err) => {
        this.log.warn(
          `Webhook não reaplicado ao conectar (connectionId=${conn.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    if (state.connected) {
      await this.prisma.whatsAppConnection.update({
        where: { id: conn.id },
        data: { isActive: true },
      });
    }
    return { ok: true as const, connected: state.connected, detail: state.detail };
  }

  async reapplyWebhook(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const appUrl = appPublicUrl();
    if (!appUrl) {
      throw new BadRequestException("Configure PUBLIC_APP_URL para o webhook.");
    }
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId, provider: "EVOLUTION" },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");
    const cfg = parseEvolutionConfig(conn.config);
    if (!cfg) throw new BadRequestException("Configuração inválida");
    try {
      await setEvolutionInstanceWebhook({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: cfg.instanceName,
        webhookUrl: `${appUrl}/webhooks/whatsapp/evolution/${conn.id}`,
        webhookHeaders: buildWebhookHeaders(),
      });
    } catch (e) {
      throw this.wrapEvolutionError(e, "Falha ao reaplicar webhook");
    }
    return { ok: true as const };
  }

  async createMetaConnection(
    u: RequestUser,
    input: {
      name?: string;
      phoneNumberId: string;
      accessToken: string;
      businessAccountId?: string;
    },
  ) {
    assertCanConfigureTenant(u.role);
    if (!input.phoneNumberId?.trim() || !input.accessToken?.trim()) {
      throw new BadRequestException("phoneNumberId e accessToken são obrigatórios");
    }
    const phoneNumberId = input.phoneNumberId.trim();
    const accessToken = input.accessToken.trim();
    await assertMetaGraphPhoneAccess(phoneNumberId, accessToken);
    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        tenantId: u.tenantId,
        name: input.name?.trim() || "WhatsApp Official",
        provider: "META",
        isActive: true,
        config: {
          phoneNumberId,
          accessToken,
          businessAccountId: input.businessAccountId?.trim() ?? "",
        },
      },
    });
    return { ok: true as const, connectionId: connection.id };
  }

  getMetaOnboardingInfo(u: RequestUser) {
    assertCanConfigureTenant(u.role);
    const base = appPublicUrl();
    const verify = process.env.META_VERIFY_TOKEN ?? "";
    return {
      callbackUrl: base ? `${base}/webhooks/whatsapp/meta` : "",
      verifyToken: verify,
      verifyTokenConfigured: !!verify.trim(),
      metaAppSecretConfigured: !!process.env.META_APP_SECRET?.trim(),
      publicAppUrlConfigured: !!base,
      subscribedFieldsSuggestion: ["messages"],
    };
  }

  /** Placeholder até implementar exchange code→token + persistência por tenant. */
  exchangeMetaOAuthCode(
    u: RequestUser,
    _body: { code?: string; state?: string },
  ): never {
    assertCanConfigureTenant(u.role);
    throw new BadRequestException(
      "Embedded Signup: troca do código OAuth pelo token ainda não está implementada. Use Phone Number ID + Access Token manual em Canais, ou conclua esta rota no backend quando o app Meta estiver aprovado.",
    );
  }

  getMetaEmbeddedSignupInfo(u: RequestUser) {
    assertCanConfigureTenant(u.role);
    const clientId = process.env.META_EMBEDDED_SIGNUP_CLIENT_ID?.trim();
    const redirectUri = process.env.META_EMBEDDED_SIGNUP_REDIRECT_URI?.trim();
    const docsUrl =
      "https://developers.facebook.com/docs/whatsapp/embedded-signup";
    if (!clientId || !redirectUri) {
      return {
        enabled: false as const,
        docsUrl,
        message:
          "Defina META_EMBEDDED_SIGNUP_CLIENT_ID e META_EMBEDDED_SIGNUP_REDIRECT_URI no servidor quando o app Meta estiver aprovado para Embedded Signup. Até lá, use Phone Number ID + token manual na aba Canais.",
      };
    }
    const scope = [
      "whatsapp_business_management",
      "business_management",
    ].join(",");
    const oauthAuthorizationUrl =
      `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        response_type: "code",
        state: `tenant:${u.tenantId}`,
      }).toString();
    return {
      enabled: true as const,
      docsUrl,
      oauthAuthorizationUrl,
      redirectUri,
    };
  }

  async listMetaMessageTemplates(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId: u.tenantId, provider: "META" },
    });
    if (!conn) throw new BadRequestException("Conexão Meta não encontrada");
    const cfg = conn.config as {
      accessToken?: string;
      businessAccountId?: string;
    };
    const waba = cfg.businessAccountId?.trim();
    const token = cfg.accessToken?.trim();
    if (!waba) {
      throw new BadRequestException(
        "Informe o WhatsApp Business Account ID (WABA) na conexão para listar templates.",
      );
    }
    if (!token) throw new BadRequestException("Access token ausente na conexão");
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${waba}/message_templates`,
    );
    url.searchParams.set("fields", "name,status,language,category");
    url.searchParams.set("limit", "100");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { name: string; status: string; language?: string; category?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new BadRequestException(
        json.error?.message ??
          `Falha ao listar templates (HTTP ${res.status})`,
      );
    }
    const data = json.data ?? [];
    const approved = data.filter((t) => t.status === "APPROVED");
    return { ok: true as const, templates: approved };
  }

  async patchMetaConnection(
    u: RequestUser,
    connectionId: string,
    input: {
      name?: string;
      phoneNumberId?: string;
      accessToken?: string;
      businessAccountId?: string;
    },
  ) {
    assertCanConfigureTenant(u.role);
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId: u.tenantId, provider: "META" },
    });
    if (!conn) throw new BadRequestException("Conexão Meta não encontrada");
    const prev = conn.config as Record<string, string>;
    const phoneNumberId = (input.phoneNumberId ?? prev.phoneNumberId ?? "").trim();
    const accessToken = (input.accessToken ?? prev.accessToken ?? "").trim();
    const businessAccountId = (
      input.businessAccountId ?? prev.businessAccountId ??
      ""
    ).trim();
    if (!phoneNumberId || !accessToken) {
      throw new BadRequestException("phoneNumberId e accessToken são obrigatórios");
    }
    const tokenOrPhoneChanged =
      input.accessToken !== undefined || input.phoneNumberId !== undefined;
    if (tokenOrPhoneChanged) {
      await assertMetaGraphPhoneAccess(phoneNumberId, accessToken);
    }
    const name =
      input.name !== undefined ? input.name.trim() || conn.name : conn.name;
    await this.prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: {
        name,
        config: {
          ...prev,
          phoneNumberId,
          accessToken,
          businessAccountId,
        },
      },
    });
    return { ok: true as const };
  }

  async testMetaConnection(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId: u.tenantId, provider: "META" },
    });
    if (!conn) throw new BadRequestException("Conexão Meta não encontrada");
    const provider = createWhatsAppProvider(conn);
    return provider.getConnectionStatus();
  }

  async createInstagramConnection(
    u: RequestUser,
    input: {
      name?: string;
      pageId: string;
      accessToken: string;
      igUserId: string;
    },
  ) {
    assertCanConfigureTenant(u.role);
    if (!input.pageId?.trim() || !input.accessToken?.trim() || !input.igUserId?.trim()) {
      throw new BadRequestException("pageId, accessToken e igUserId são obrigatórios");
    }
    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        tenantId: u.tenantId,
        name: input.name?.trim() || "Instagram",
        provider: "INSTAGRAM",
        isActive: true,
        config: {
          pageId: input.pageId.trim(),
          accessToken: input.accessToken.trim(),
          igUserId: input.igUserId.trim(),
        },
      },
    });
    return { ok: true as const, connectionId: connection.id };
  }

  private wrapEvolutionError(e: unknown, fallback: string) {
    if (e instanceof BadRequestException || e instanceof ServiceUnavailableException) {
      return e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("ETIMEDOUT")
    ) {
      return new ServiceUnavailableException(
        `Evolution API indisponível (${process.env.EVOLUTION_BASE_URL}). Verifique se o serviço está rodando.`,
      );
    }
    const hint = fallback.includes("webhook")
      ? " Dica: com WhatsApp desconectado na Evolution, /webhook/set costuma falhar (instância fora da memória). Conecte o canal e tente de novo; confira também EVOLUTION_BASE_URL e api key."
      : "";
    return new BadRequestException(`${fallback}: ${msg}${hint}`);
  }

  async deleteConnection(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");
    if (conn.provider === "EVOLUTION") {
      const cfg = parseEvolutionConfig(conn.config);
      if (cfg) {
        await deleteEvolutionInstance({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          instanceName: cfg.instanceName,
        }).catch(() => {});
      }
    }
    await this.prisma.whatsAppConnection.delete({ where: { id: connectionId } });
  }
}
