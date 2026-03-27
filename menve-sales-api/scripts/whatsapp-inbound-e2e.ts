import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import prisma from "../../menve-sales-web/src/lib/prisma";

function loadDotEnvIfAvailable() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function main() {
  loadDotEnvIfAvailable();
  const appUrl = requiredEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");

  const tenant = await prisma.tenant.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!tenant) {
    throw new Error("No tenant found. Run seed before this check.");
  }

  const probeExternalId = `probe-${Date.now()}`;
  const probePhone = "+5511999999999";

  const connection = await prisma.whatsAppConnection.create({
    data: {
      tenantId: tenant.id,
      provider: "EVOLUTION",
      name: "Probe E2E",
      isActive: false,
      config: {
        baseUrl: process.env.EVOLUTION_BASE_URL ?? "http://localhost:8080",
        apiKey: process.env.EVOLUTION_API_KEY ?? "probe",
        instanceName: "probe",
      },
    },
    select: { id: true },
  });

  try {
    const payload = {
      data: {
        messages: [
          {
            key: {
              id: probeExternalId,
              remoteJid: `${probePhone.replace(/\D/g, "")}@s.whatsapp.net`,
              fromMe: false,
            },
            message: { conversation: "probe inbound e2e" },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        ],
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
    if (webhookSecret) headers["x-webhook-secret"] = webhookSecret;

    const webhookRes = await fetch(
      `${appUrl}/api/webhooks/whatsapp/evolution/${connection.id}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    );
    if (!webhookRes.ok) {
      throw new Error(`Webhook failed with HTTP ${webhookRes.status}`);
    }

    const persisted = await prisma.message.findFirst({
      where: {
        tenantId: tenant.id,
        whatsappConnectionId: connection.id,
        externalId: probeExternalId,
      },
      select: { id: true, body: true },
    });
    if (!persisted) {
      throw new Error("Inbound message was not persisted");
    }

    console.log(
      `[PASS] inbound-e2e: message persisted (${persisted.id}) body="${persisted.body}"`,
    );
  } finally {
    await prisma.whatsAppConnection.delete({ where: { id: connection.id } });
    await prisma.contact
      .deleteMany({
        where: { tenantId: tenant.id, phone: probePhone },
      })
      .catch(() => {});
  }
}

void main()
  .catch((error) => {
    console.error(
      `[FAIL] inbound-e2e: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
