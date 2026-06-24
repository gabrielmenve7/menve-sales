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
import { getZappfyWebhookParseMeta } from "../whatsapp/zappfy-provider";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  fetchEvolutionConnectionState,
  getEvolutionBaseUrlForDisplay,
  getEvolutionEnv,
  getPairingQrDataUrl,
  setEvolutionInstanceWebhook,
} from "../whatsapp/evolution-admin";
import {
  buildZappfyMenveWebhookUrl,
  connectZappfyInstance,
  createZappfyInstance,
  deleteZappfyInstance,
  fetchZappfyInstanceInfo,
  fetchZappfyStatus,
  fetchZappfyWebhookFind,
  getZappfyBaseUrlForDisplay,
  getZappfyEnv,
  getZappfyPairingQrDataUrl,
  setZappfyWebhook,
} from "../whatsapp/zappfy-admin";

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
    process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return u || "";
}

function isTemporaryWebhookUrl(url: string) {
  const u = url.toLowerCase();
  return (
    u.includes("localhost") ||
    u.includes("127.0.0.1") ||
    u.includes(".ngrok-free.") ||
    u.includes(".ngrok.") ||
    u.includes("trycloudflare.com")
  );
}

function assertProductionWebhookUrl(url: string) {
  if (process.env.NODE_ENV !== "production") return;
  if (!isTemporaryWebhookUrl(url)) return;
  throw new BadRequestException(
    `PUBLIC_APP_URL da API está apontando para URL temporária/local (${url}). Em produção, defina PUBLIC_APP_URL no serviço da API como a URL pública estável da API (ex.: https://menve-sales-production.up.railway.app) e faça redeploy.`,
  );
}

function normalizeWebhookUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url.split("?")[0]?.replace(/\/$/, "") ?? url;
  }
}

function buildWebhookHeaders(provider: "EVOLUTION" | "ZAPPFY"): Record<string, string> | undefined {
  const secret =
    provider === "ZAPPFY"
      ? process.env.ZAPPFY_WEBHOOK_SECRET?.trim()
      : process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (!secret) return undefined;
  return { "x-webhook-secret": secret };
}

type ZappfyConnConfig = {
  baseUrl: string;
  instanceToken: string;
  instanceKey?: string;
};

function parseZappfyConfig(raw: unknown): ZappfyConnConfig | null {
  const c = raw as Record<string, unknown>;
  const baseUrl = String(c.baseUrl ?? "");
  const instanceToken = String(c.instanceToken ?? "");
  if (!baseUrl || !instanceToken) return null;
  const instanceKey =
    typeof c.instanceKey === "string" && c.instanceKey.trim()
      ? c.instanceKey.trim()
      : undefined;
  return { baseUrl, instanceToken, instanceKey };
}

async function applyZappfyWebhook(cfg: ZappfyConnConfig, webhookUrl: string) {
  await setZappfyWebhook({
    baseUrl: cfg.baseUrl,
    instanceToken: cfg.instanceToken,
    webhookUrl,
    webhookHeaders: buildWebhookHeaders("ZAPPFY"),
    instanceKey: cfg.instanceKey,
  });
}

type PairingProvider = "EVOLUTION" | "ZAPPFY";

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

  webhookPath(connectionId: string, provider: PairingProvider = "ZAPPFY") {
    if (provider === "ZAPPFY") {
      return buildZappfyMenveWebhookUrl(connectionId);
    }
    const base = appPublicUrl();
    if (!base) return "";
    return `${base}/webhooks/whatsapp/evolution/${connectionId}`;
  }

  async startPairing(
    u: RequestUser,
    input?: { name?: string; provider?: PairingProvider },
  ) {
    const provider = input?.provider ?? "ZAPPFY";
    if (provider === "EVOLUTION") {
      return this.startEvolutionPairing(u, input);
    }
    return this.startZappfyPairing(u, input);
  }

  async startZappfyPairing(u: RequestUser, input?: { name?: string }) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const appUrl = appPublicUrl();
    if (!appUrl) {
      throw new BadRequestException(
        "Configure PUBLIC_APP_URL ou NEXT_PUBLIC_APP_URL para o webhook.",
      );
    }
    assertProductionWebhookUrl(appUrl);
    const { baseUrl, adminToken } = getZappfyEnv();
    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        tenantId,
        name: input?.name?.trim() || "WhatsApp",
        provider: "ZAPPFY",
        isActive: false,
        config: { baseUrl, instanceToken: "" },
      },
    });
    const instanceLabel = `menve${connection.id.replace(/-/g, "")}`.slice(0, 60);
    const webhookUrl = this.webhookPath(connection.id, "ZAPPFY");
    try {
      const { instanceToken } = await createZappfyInstance({
        baseUrl,
        adminToken,
        name: instanceLabel,
      });
      await this.prisma.whatsAppConnection.update({
        where: { id: connection.id },
        data: {
          config: { baseUrl, instanceToken },
        },
      });
      await setZappfyWebhook({
        baseUrl,
        instanceToken,
        webhookUrl,
        webhookHeaders: buildWebhookHeaders("ZAPPFY"),
      }).catch((err) => {
        this.log.warn(
          `Webhook Zappfy não aplicado no init (connectionId=${connection.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      const connectRes = await connectZappfyInstance({
        baseUrl,
        instanceToken,
      });
      const qrDataUrl = await getZappfyPairingQrDataUrl({
        baseUrl,
        instanceToken,
        connectResponse: connectRes,
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
      throw this.wrapZappfyError(e, "Falha ao parear com a Zappfy API");
    }
  }

  /** Vincula instância já criada no painel Zappfy (token da instância — não precisa de admintoken). */
  async linkZappfyExisting(
    u: RequestUser,
    input: { instanceToken: string; name?: string },
  ) {
    assertCanConfigureTenant(u.role);
    const instanceToken = input.instanceToken?.trim();
    if (!instanceToken) {
      throw new BadRequestException("Informe o token da instância Zappfy.");
    }
    const appUrl = appPublicUrl();
    if (!appUrl) {
      throw new BadRequestException(
        "Configure PUBLIC_APP_URL na API para o webhook.",
      );
    }
    assertProductionWebhookUrl(appUrl);
    const baseUrl = getZappfyBaseUrlForDisplay();
    const info = await fetchZappfyInstanceInfo({ baseUrl, instanceToken }).catch(
      (e) => {
        throw this.wrapZappfyError(
          e,
          "Token Zappfy inválido ou API indisponível",
        );
      },
    );
    const zcfg: ZappfyConnConfig = {
      baseUrl,
      instanceToken,
      ...(info.instanceKey ? { instanceKey: info.instanceKey } : {}),
    };
    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        tenantId: u.tenantId,
        name: input.name?.trim() || "Zappfy",
        provider: "ZAPPFY",
        isActive: info.connected,
        config: zcfg,
      },
    });
    try {
      await applyZappfyWebhook(zcfg, this.webhookPath(connection.id, "ZAPPFY"));
    } catch (e) {
      await this.prisma.whatsAppConnection
        .delete({ where: { id: connection.id } })
        .catch(() => {});
      throw this.wrapZappfyError(e, "Falha ao configurar webhook Zappfy");
    }
    return {
      ok: true as const,
      connectionId: connection.id,
      connected: info.connected,
      detail: info.detail,
    };
  }

  async startEvolutionPairing(u: RequestUser, input?: { name?: string }) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const appUrl = appPublicUrl();
    if (!appUrl) {
      throw new BadRequestException(
        "Configure PUBLIC_APP_URL ou NEXT_PUBLIC_APP_URL para o webhook.",
      );
    }
    assertProductionWebhookUrl(appUrl);
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
        webhookHeaders: buildWebhookHeaders("EVOLUTION"),
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
      where: {
        id: connectionId,
        tenantId,
        provider: { in: ["EVOLUTION", "ZAPPFY"] },
      },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");

    if (conn.provider === "ZAPPFY") {
      const cfg = parseZappfyConfig(conn.config);
      if (!cfg) throw new BadRequestException("Configuração inválida");
      let qrDataUrl: string | null;
      try {
        qrDataUrl = await getZappfyPairingQrDataUrl({
          baseUrl: cfg.baseUrl,
          instanceToken: cfg.instanceToken,
        });
      } catch (e) {
        throw this.wrapZappfyError(e, "Falha ao recarregar QR");
      }
      if (!qrDataUrl) {
        throw new BadRequestException("Não foi possível obter um novo QR Code.");
      }
      return { ok: true as const, qrDataUrl };
    }

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
      where: {
        id: connectionId,
        tenantId,
        provider: { in: ["EVOLUTION", "ZAPPFY"] },
      },
    });
    if (!conn) return { ok: false as const, error: "not_found" as const };

    if (conn.provider === "ZAPPFY") {
      const cfg = parseZappfyConfig(conn.config);
      if (!cfg) return { ok: false as const, error: "invalid_config" as const };
      const info = await fetchZappfyInstanceInfo({
        baseUrl: cfg.baseUrl,
        instanceToken: cfg.instanceToken,
      });
      const zcfg: ZappfyConnConfig = {
        ...cfg,
        ...(info.instanceKey ? { instanceKey: info.instanceKey } : {}),
      };
      const appUrl = appPublicUrl();
      if (info.connected && appUrl && !conn.isActive) {
        await applyZappfyWebhook(zcfg, this.webhookPath(conn.id, "ZAPPFY")).catch(
          (err) => {
            this.log.warn(
              `Webhook Zappfy não reaplicado ao conectar (connectionId=${conn.id}): ${err instanceof Error ? err.message : String(err)}`,
            );
          },
        );
      }
      if (info.connected) {
        await this.prisma.whatsAppConnection.update({
          where: { id: conn.id },
          data: {
            isActive: true,
            config: zcfg,
          },
        });
      }
      return { ok: true as const, connected: info.connected, detail: info.detail };
    }

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
        webhookHeaders: buildWebhookHeaders("EVOLUTION"),
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
    assertProductionWebhookUrl(appUrl);
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: {
        id: connectionId,
        tenantId,
        provider: { in: ["EVOLUTION", "ZAPPFY"] },
      },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");

    if (conn.provider === "ZAPPFY") {
      const cfg = parseZappfyConfig(conn.config);
      if (!cfg) throw new BadRequestException("Configuração inválida");
      try {
        await applyZappfyWebhook(cfg, this.webhookPath(conn.id, "ZAPPFY"));
        const found = await fetchZappfyWebhookFind({
          baseUrl: cfg.baseUrl,
          instanceToken: cfg.instanceToken,
        }).catch(() => null);
        const info = await fetchZappfyInstanceInfo({
          baseUrl: cfg.baseUrl,
          instanceToken: cfg.instanceToken,
        }).catch(() => null);
        return {
          ok: true as const,
          remoteWebhookUrl: found?.url ?? info?.webhookUrl ?? null,
          remoteWebhookEvents: found?.events ?? null,
        };
      } catch (e) {
        throw this.wrapZappfyError(e, "Falha ao reaplicar webhook");
      }
    }

    const cfg = parseEvolutionConfig(conn.config);
    if (!cfg) throw new BadRequestException("Configuração inválida");
    try {
      await setEvolutionInstanceWebhook({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: cfg.instanceName,
        webhookUrl: `${appUrl}/webhooks/whatsapp/evolution/${conn.id}`,
        webhookHeaders: buildWebhookHeaders("EVOLUTION"),
      });
    } catch (e) {
      throw this.wrapEvolutionError(e, "Falha ao reaplicar webhook");
    }
    return { ok: true as const };
  }

  async getWebhookDiagnostics(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId: u.tenantId },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");
    if (conn.provider !== "ZAPPFY" && conn.provider !== "EVOLUTION") {
      throw new BadRequestException("Diagnóstico disponível só para Zappfy/Evolution");
    }

    const appUrl = appPublicUrl();
    const expectedWebhookUrl =
      conn.provider === "ZAPPFY"
        ? buildZappfyMenveWebhookUrl(conn.id)
        : appUrl
          ? `${appUrl}/webhooks/whatsapp/evolution/${conn.id}`
          : "";

    const cfg = conn.config as Record<string, unknown>;
    let connectionStatus: { connected: boolean; detail?: string } | null = null;
    let remoteWebhookUrl: string | null = null;
    let remoteWebhookEvents: string[] | null = null;
    let remoteWebhookEnabled: boolean | null = null;
    if (conn.provider === "ZAPPFY") {
      const zcfg = parseZappfyConfig(conn.config);
      if (zcfg) {
        const [info, found] = await Promise.all([
          fetchZappfyInstanceInfo({
            baseUrl: zcfg.baseUrl,
            instanceToken: zcfg.instanceToken,
          }).catch(() => null),
          fetchZappfyWebhookFind({
            baseUrl: zcfg.baseUrl,
            instanceToken: zcfg.instanceToken,
          }).catch(() => null),
        ]);
        if (info) {
          connectionStatus = { connected: info.connected, detail: info.detail };
        }
        remoteWebhookUrl = found?.url ?? info?.webhookUrl ?? null;
        remoteWebhookEvents = found?.events ?? null;
        remoteWebhookEnabled =
          typeof found?.enabled === "boolean" ? found.enabled : null;
      }
    } else {
      const ecfg = parseEvolutionConfig(conn.config);
      if (ecfg) {
        connectionStatus = await fetchEvolutionConnectionState({
          baseUrl: ecfg.baseUrl,
          apiKey: ecfg.apiKey,
          instanceName: ecfg.instanceName,
        }).catch(() => ({ connected: false, detail: "status indisponível" }));
      }
    }

    const webhookUrlMatchesExpected =
      !!remoteWebhookUrl &&
      !!expectedWebhookUrl &&
      normalizeWebhookUrlForCompare(remoteWebhookUrl) ===
        normalizeWebhookUrlForCompare(expectedWebhookUrl);

    return {
      ok: true as const,
      connectionId: conn.id,
      tenantId: conn.tenantId,
      provider: conn.provider,
      isActive: conn.isActive,
      publicAppUrl: appUrl || null,
      expectedWebhookUrl,
      webhookUrlMatchesExpected,
      webhookSecretConfigured: conn.provider === "ZAPPFY"
        ? !!process.env.ZAPPFY_WEBHOOK_SECRET?.trim()
        : !!process.env.EVOLUTION_WEBHOOK_SECRET?.trim(),
      webhookSecretUsesQuery:
        conn.provider === "ZAPPFY" &&
        !!process.env.ZAPPFY_WEBHOOK_SECRET?.trim(),
      lastWebhookAt:
        typeof cfg.lastWebhookAt === "string" ? cfg.lastWebhookAt : null,
      lastWebhookParsed:
        typeof cfg.lastWebhookParsed === "number" ? cfg.lastWebhookParsed : null,
      lastWebhookBlobs:
        typeof cfg.lastWebhookBlobs === "number" ? cfg.lastWebhookBlobs : null,
      lastWebhookProcessed:
        typeof cfg.lastWebhookProcessed === "number"
          ? cfg.lastWebhookProcessed
          : null,
      lastWebhookEvent:
        typeof cfg.lastWebhookEvent === "string" ? cfg.lastWebhookEvent : null,
      lastWebhookFromMe:
        typeof cfg.lastWebhookFromMe === "boolean" ? cfg.lastWebhookFromMe : null,
      lastWebhookRemoteJid:
        typeof cfg.lastWebhookRemoteJid === "string"
          ? cfg.lastWebhookRemoteJid
          : null,
      lastWebhookAuthFailedAt:
        typeof cfg.lastWebhookAuthFailedAt === "string"
          ? cfg.lastWebhookAuthFailedAt
          : null,
      remoteWebhookUrl,
      remoteWebhookEvents,
      remoteWebhookEnabled,
      connectionStatus,
      warnings: [
        ...(!appUrl ? ["PUBLIC_APP_URL não configurado na API"] : []),
        ...(!conn.isActive ? ["Canal marcado como desconectado no Menve"] : []),
        ...(connectionStatus && !connectionStatus.connected
          ? ["Instância desconectada no provedor"]
          : []),
        ...(typeof cfg.lastWebhookAt !== "string"
          ? ["Nenhum webhook recebido ainda nesta conexão"]
          : []),
        ...(conn.provider === "ZAPPFY" &&
        process.env.ZAPPFY_WEBHOOK_SECRET?.trim()
          ? [
              "ZAPPFY_WEBHOOK_SECRET ativo: use «Reaplicar webhook» para registrar a URL com ?webhook_secret= (painel Zappfy não suporta headers custom).",
            ]
          : []),
        ...(typeof cfg.lastWebhookAuthFailedAt === "string"
          ? [
              "Última tentativa de webhook da Zappfy foi rejeitada (401) — secret ausente ou incorreto na URL/header.",
            ]
          : []),
        ...(remoteWebhookUrl &&
        expectedWebhookUrl &&
        !remoteWebhookUrl.includes(conn.id)
          ? [
              `URL de webhook na Zappfy (${remoteWebhookUrl}) não contém o connectionId atual — reaplique o webhook.`,
            ]
          : []),
        ...(remoteWebhookUrl &&
        expectedWebhookUrl &&
        remoteWebhookUrl.includes(conn.id) &&
        !webhookUrlMatchesExpected
          ? [
              `URL na Zappfy difere da esperada (query/path) — esperado: ${expectedWebhookUrl}`,
            ]
          : []),
        ...(remoteWebhookEnabled === false
          ? ["Webhook desabilitado na instância Zappfy"]
          : []),
      ],
    };
  }

  async probeWebhook(u: RequestUser, connectionId: string) {
    assertCanConfigureTenant(u.role);
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId: u.tenantId },
    });
    if (!conn) throw new BadRequestException("Conexão não encontrada");
    if (conn.provider !== "ZAPPFY" && conn.provider !== "EVOLUTION") {
      throw new BadRequestException("Probe disponível só para Zappfy/Evolution");
    }

    const appUrl = appPublicUrl();
    if (!appUrl) {
      throw new BadRequestException("Configure PUBLIC_APP_URL na API.");
    }
    const segment = conn.provider === "ZAPPFY" ? "zappfy" : "evolution";
    const webhookUrl =
      conn.provider === "ZAPPFY"
        ? this.webhookPath(conn.id, "ZAPPFY")
        : `${appUrl}/webhooks/whatsapp/${segment}/${conn.id}`;
    const secret =
      conn.provider === "ZAPPFY"
        ? process.env.ZAPPFY_WEBHOOK_SECRET?.trim()
        : process.env.EVOLUTION_WEBHOOK_SECRET?.trim();

    const probeId = `menve-probe-${Date.now()}`;
    const payloads: { label: string; body: Record<string, unknown> }[] =
      conn.provider === "ZAPPFY"
        ? [
            {
              label: "texto-simples",
              body: {
                event: "messages",
                data: {
                  messageId: probeId,
                  from: "5511999999999",
                  text: "probe texto",
                  fromMe: false,
                  timestamp: Date.now(),
                },
              },
            },
            {
              label: "new-message-audio",
              body: {
                type: "NEW-MESSAGE",
                data: {
                  key: {
                    remoteJid: "5511888888888@s.whatsapp.net",
                    fromMe: false,
                    id: `${probeId}-audio`,
                  },
                  message: {
                    audioMessage: {
                      url: "https://example.com/probe.m4a",
                      mimetype: "audio/mp4",
                      ptt: true,
                    },
                  },
                  messageTimestamp: { low: Math.floor(Date.now() / 1000), high: 0 },
                },
              },
            },
          ]
        : [
            {
              label: "messages-upsert",
              body: {
                event: "messages.upsert",
                data: {
                  key: {
                    id: probeId,
                    remoteJid: "5511999999999@s.whatsapp.net",
                    fromMe: false,
                  },
                  message: { conversation: "probe evolution" },
                  messageTimestamp: Math.floor(Date.now() / 1000),
                },
              },
            },
          ];

    const results: {
      label: string;
      httpStatus: number;
      parsed?: number;
      processed?: number;
      ok: boolean;
      detail?: string;
    }[] = [];

    for (const p of payloads) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (secret && conn.provider !== "ZAPPFY") {
        headers["x-webhook-secret"] = secret;
      } else if (secret && !webhookUrl.includes("webhook_secret=")) {
        headers["x-webhook-secret"] = secret;
      }

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(p.body),
        });
        const json = (await res.json().catch(() => ({}))) as {
          processed?: number;
          parsed?: number;
          error?: string;
        };
        const parseMeta =
          conn.provider === "ZAPPFY"
            ? getZappfyWebhookParseMeta(p.body)
            : { blobCount: 0 };
        results.push({
          label: p.label,
          httpStatus: res.status,
          processed: json.processed,
          ok: res.ok,
          detail: res.ok
            ? `blobs=${parseMeta.blobCount}`
            : json.error ?? `HTTP ${res.status}`,
        });
      } catch (e) {
        results.push({
          label: p.label,
          httpStatus: 0,
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const diag = await this.getWebhookDiagnostics(u, connectionId);
    return {
      ok: results.every((r) => r.ok),
      webhookUrl,
      results,
      diagnostics: diag,
    };
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

  private wrapZappfyError(e: unknown, fallback: string) {
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
        `Zappfy API indisponível (${getZappfyBaseUrlForDisplay()}). Verifique ZAPPFY_BASE_URL e ZAPPFY_ADMIN_TOKEN.`,
      );
    }
    if (/Zappfy[^:]*:\s*HTTP\s+5\d\d/i.test(msg)) {
      return new ServiceUnavailableException(
        `${fallback}: a Zappfy retornou erro de servidor. URL base: ${getZappfyBaseUrlForDisplay()}.`,
      );
    }
    const hint = fallback.includes("webhook")
      ? " Dica: conecte o canal e tente de novo; confira PUBLIC_APP_URL e ZAPPFY_ADMIN_TOKEN."
      : "";
    return new BadRequestException(`${fallback}: ${msg}${hint}`);
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
        `Evolution API indisponível (${getEvolutionBaseUrlForDisplay()}). Verifique se o serviço está rodando e se EVOLUTION_BASE_URL na API Nest (ex.: Railway) inclui o subpath correto (ex.: /manager).`,
      );
    }
    /** Resposta 5xx do Evolution (ou proxy) — não é “requisição inválida” do cliente. */
    if (/Evolution[^:]*:\s*HTTP\s+5\d\d/i.test(msg)) {
      return new ServiceUnavailableException(
        `${fallback}: o Evolution retornou erro de servidor (502/503 etc.). URL base configurada: ${getEvolutionBaseUrlForDisplay()}. Confira se a API Nest alcança esse host/subpath e se a Evolution está no ar.`,
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
    if (conn.provider === "ZAPPFY") {
      const cfg = parseZappfyConfig(conn.config);
      if (cfg) {
        const adminToken = process.env.ZAPPFY_ADMIN_TOKEN?.trim();
        await deleteZappfyInstance({
          baseUrl: cfg.baseUrl,
          instanceToken: cfg.instanceToken,
          adminToken,
        }).catch(() => {});
      }
    }
    await this.prisma.whatsAppConnection.delete({ where: { id: connectionId } });
  }
}
