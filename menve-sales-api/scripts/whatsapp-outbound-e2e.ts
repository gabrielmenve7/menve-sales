import { createServer } from "node:http";
import prisma from "../../menve-sales-web/src/lib/prisma";
import { sendOutboundText } from "../../menve-sales-web/src/lib/whatsapp/message-service";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!tenant) {
    throw new Error("No tenant found. Run seed before this check.");
  }

  const user =
    (await prisma.user.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    })) ??
    (await prisma.user.create({
      data: {
        email: `probe-outbound-${Date.now()}@menve.local`,
        tenantId: tenant.id,
        role: "ADMIN",
      },
      select: { id: true },
    }));

  const externalId = `out-${Date.now()}`;
  const mockApiKey = "probe-api-key";

  const server = createServer((req, res) => {
    if (
      req.method === "POST" &&
      req.url?.startsWith("/message/sendText/") &&
      req.headers.apikey === mockApiKey
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ key: { id: externalId } }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock Evolution server.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const connection = await prisma.whatsAppConnection.create({
    data: {
      tenantId: tenant.id,
      provider: "EVOLUTION",
      name: "Probe Outbound E2E",
      isActive: true,
      config: {
        baseUrl,
        apiKey: mockApiKey,
        instanceName: "probe",
      },
    },
    select: { id: true },
  });

  const phone = "+5511888888888";

  try {
    const sent = await sendOutboundText({
      tenantId: tenant.id,
      connectionId: connection.id,
      userId: user.id,
      toPhone: phone,
      text: "probe outbound e2e",
    });
    if (!sent.ok) {
      throw new Error("sendOutboundText returned not ok");
    }

    const persisted = await prisma.message.findFirst({
      where: {
        tenantId: tenant.id,
        whatsappConnectionId: connection.id,
        externalId,
      },
      select: { id: true, body: true, direction: true },
    });
    if (!persisted) {
      throw new Error("Outbound message was not persisted");
    }

    console.log(
      `[PASS] outbound-e2e: message persisted (${persisted.id}) direction=${persisted.direction}`,
    );
  } finally {
    await prisma.whatsAppConnection.delete({ where: { id: connection.id } });
    await prisma.contact.deleteMany({ where: { tenantId: tenant.id, phone } });
    server.close();
  }
}

void main()
  .catch((error) => {
    console.error(
      `[FAIL] outbound-e2e: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
