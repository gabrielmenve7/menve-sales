/**
 * Vincula uma instância Zappfy já existente (token do painel) ao tenant Menve.
 *
 * Uso:
 *   npx tsx scripts/zappfy-link-existing.ts <instanceToken> [--tenant=demo] [--name="Gabriel M01"]
 */
import "./load-api-env";
import { scriptPrisma } from "./_prisma";
import {
  fetchZappfyStatus,
  getZappfyBaseUrlForDisplay,
  setZappfyWebhook,
} from "../src/whatsapp/zappfy-admin";

function argValue(flag: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1).trim() : null;
}

function appPublicUrl() {
  return (
    process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    process.env.WEBHOOK_PUBLIC_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

function buildWebhookHeaders(): Record<string, string> | undefined {
  const secret = process.env.ZAPPFY_WEBHOOK_SECRET?.trim();
  if (!secret) return undefined;
  return { "x-webhook-secret": secret };
}

async function main() {
  const instanceToken = process.argv[2]?.trim();
  if (!instanceToken) {
    console.error(
      "Uso: npx tsx scripts/zappfy-link-existing.ts <instanceToken> [--tenant=demo] [--name=Nome]",
    );
    process.exit(1);
  }

  const tenantSlug = argValue("--tenant") || "demo";
  const name = argValue("--name") || "WhatsApp Zappfy";
  const baseUrl = getZappfyBaseUrlForDisplay();
  const appUrl = appPublicUrl();

  if (!appUrl) {
    console.error("Configure PUBLIC_APP_URL no menve-sales-api/.env");
    process.exit(1);
  }

  const tenant = await scriptPrisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });
  if (!tenant) {
    console.error(`Tenant não encontrado: ${tenantSlug}`);
    process.exit(1);
  }

  const status = await fetchZappfyStatus({ baseUrl, instanceToken });
  if (!status.connected) {
    console.error(
      `Instância não conectada na Zappfy (${status.detail || "desconhecido"}). Conecte no painel antes.`,
    );
    process.exit(1);
  }

  const connection = await scriptPrisma.whatsAppConnection.create({
    data: {
      tenantId: tenant.id,
      name,
      provider: "ZAPPFY",
      isActive: true,
      config: { baseUrl, instanceToken },
    },
  });

  const webhookUrl = `${appUrl}/webhooks/whatsapp/zappfy/${connection.id}`;
  try {
    await setZappfyWebhook({
      baseUrl,
      instanceToken,
      webhookUrl,
      webhookHeaders: buildWebhookHeaders(),
    });
  } catch (error) {
    await scriptPrisma.whatsAppConnection
      .delete({ where: { id: connection.id } })
      .catch(() => {});
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Falha ao configurar webhook: ${msg}`);
    process.exit(1);
  }

  console.log("OK — instância Zappfy vinculada ao Menve");
  console.log(`  tenant:       ${tenantSlug} (${tenant.id})`);
  console.log(`  connectionId: ${connection.id}`);
  console.log(`  webhook:      ${webhookUrl}`);
  console.log(`  status:       connected (${status.detail})`);
}

void main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => scriptPrisma.$disconnect());
