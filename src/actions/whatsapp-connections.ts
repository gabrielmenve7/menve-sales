"use server";

import prisma from "@/lib/prisma";
import {
  assertCanConfigureTenant,
  getActiveTenantId,
} from "@/lib/session";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  fetchEvolutionConnectionState,
  getEvolutionEnv,
  getPairingQrDataUrl,
  setEvolutionInstanceWebhook,
} from "@/lib/whatsapp/evolution-admin";
import { revalidatePath } from "next/cache";

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

function parseEvolutionConfig(
  raw: unknown,
): EvolutionConnConfig | null {
  const c = raw as Record<string, unknown>;
  const baseUrl = String(c.baseUrl ?? "");
  const apiKey = String(c.apiKey ?? "");
  const instanceName = String(c.instanceName ?? "");
  if (!baseUrl || !apiKey || !instanceName) return null;
  return { baseUrl, apiKey, instanceName };
}

/** Cria conexão no Menve, instância na Evolution com webhook e devolve QR. */
export async function startEvolutionPairing(input?: { name?: string }) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("Configure NEXT_PUBLIC_APP_URL para montar o webhook.");
  }

  const { baseUrl, apiKey } = getEvolutionEnv();

  const connection = await prisma.whatsAppConnection.create({
    data: {
      tenantId,
      name: input?.name?.trim() || "WhatsApp",
      provider: "EVOLUTION",
      isActive: false,
      config: {
        baseUrl,
        apiKey,
        instanceName: "",
      },
    },
  });

  const instanceName = `menve${connection.id.replace(/-/g, "")}`.slice(0, 60);
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp/evolution/${connection.id}`;

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

    await prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        config: {
          baseUrl,
          apiKey,
          instanceName,
        },
      },
    });

    const qrDataUrl = await getPairingQrDataUrl({
      baseUrl,
      apiKey,
      instanceName,
      createResponse: createRes,
    });

    if (!qrDataUrl) {
      throw new Error("Não foi possível obter o QR Code. Tente recarregar.");
    }

    revalidatePath("/inbox");
    return {
      ok: true as const,
      connectionId: connection.id,
      qrDataUrl,
    };
  } catch (e) {
    await prisma.whatsAppConnection.delete({ where: { id: connection.id } }).catch(
      () => {},
    );
    throw e instanceof Error ? e : new Error("Falha ao iniciar pareamento");
  }
}

export async function refreshEvolutionQr(connectionId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const conn = await prisma.whatsAppConnection.findFirst({
    where: { id: connectionId, tenantId, provider: "EVOLUTION" },
  });
  if (!conn) throw new Error("Conexão não encontrada");
  const cfg = parseEvolutionConfig(conn.config);
  if (!cfg) throw new Error("Configuração da instância inválida");

  const qrDataUrl = await getPairingQrDataUrl({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    instanceName: cfg.instanceName,
  });
  if (!qrDataUrl) {
    throw new Error("Não foi possível obter um novo QR Code.");
  }
  return { ok: true as const, qrDataUrl };
}

export async function pollEvolutionStatus(connectionId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const conn = await prisma.whatsAppConnection.findFirst({
    where: { id: connectionId, tenantId, provider: "EVOLUTION" },
  });
  if (!conn) {
    return { ok: false as const, error: "not_found" as const };
  }
  const cfg = parseEvolutionConfig(conn.config);
  if (!cfg) {
    return { ok: false as const, error: "invalid_config" as const };
  }

  const state = await fetchEvolutionConnectionState({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    instanceName: cfg.instanceName,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (state.connected && appUrl && !conn.isActive) {
    await setEvolutionInstanceWebhook({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      instanceName: cfg.instanceName,
      webhookUrl: `${appUrl}/api/webhooks/whatsapp/evolution/${conn.id}`,
      webhookHeaders: buildWebhookHeaders(),
    }).catch(() => {});
  }

  if (state.connected) {
    await prisma.whatsAppConnection.update({
      where: { id: conn.id },
      data: { isActive: true },
    });
    revalidatePath("/inbox");
  }

  return {
    ok: true as const,
    connected: state.connected,
    detail: state.detail,
  };
}

/** Reaplica webhook na Evolution (URL única, sem sufixo /messages-upsert). Útil após atualizar o app. */
export async function reapplyEvolutionWebhook(connectionId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("Configure NEXT_PUBLIC_APP_URL para montar o webhook.");
  }

  const conn = await prisma.whatsAppConnection.findFirst({
    where: { id: connectionId, tenantId, provider: "EVOLUTION" },
  });
  if (!conn) throw new Error("Conexão não encontrada");
  const cfg = parseEvolutionConfig(conn.config);
  if (!cfg) throw new Error("Configuração da instância inválida");

  await setEvolutionInstanceWebhook({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    instanceName: cfg.instanceName,
    webhookUrl: `${appUrl}/api/webhooks/whatsapp/evolution/${conn.id}`,
    webhookHeaders: buildWebhookHeaders(),
  });
  revalidatePath("/inbox");
  return { ok: true as const };
}

export async function deleteWhatsAppConnection(connectionId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const conn = await prisma.whatsAppConnection.findFirst({
    where: { id: connectionId, tenantId },
  });
  if (!conn) throw new Error("Conexão não encontrada");

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

  await prisma.whatsAppConnection.delete({ where: { id: connectionId } });
  revalidatePath("/inbox");
}
