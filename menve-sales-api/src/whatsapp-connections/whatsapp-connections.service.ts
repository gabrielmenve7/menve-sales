import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  fetchEvolutionConnectionState,
  getEvolutionEnv,
  getPairingQrDataUrl,
  setEvolutionInstanceWebhook,
} from "../whatsapp/evolution-admin";

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
    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        tenantId: u.tenantId,
        name: input.name?.trim() || "WhatsApp Official",
        provider: "META",
        isActive: true,
        config: {
          phoneNumberId: input.phoneNumberId.trim(),
          accessToken: input.accessToken.trim(),
          businessAccountId: input.businessAccountId?.trim() ?? "",
        },
      },
    });
    return { ok: true as const, connectionId: connection.id };
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
