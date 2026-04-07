import "./load-api-env";
import { scriptPrisma as prisma } from "./_prisma";

/**
 * Mostra se existem conversas/mensagens no Postgres (mesmo banco da API).
 * Se aqui aparecer mensagem e o Inbox no browser não, o problema é tenant/slug ou INTERNAL_API_URL.
 *
 * npx tsx scripts/inbox-db-snapshot.ts
 */

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (tenants.length === 0) {
    console.log("Nenhum tenant no banco.");
    return;
  }
  for (const t of tenants) {
    const convCount = await prisma.conversation.count({
      where: { tenantId: t.id },
    });
    const msgCount = await prisma.message.count({ where: { tenantId: t.id } });
    const lastMsg = await prisma.message.findFirst({
      where: { tenantId: t.id },
      orderBy: { createdAt: "desc" },
      select: {
        body: true,
        createdAt: true,
        direction: true,
        whatsappConnectionId: true,
      },
    });
    const conns = await prisma.whatsAppConnection.findMany({
      where: { tenantId: t.id },
      select: { id: true, name: true, provider: true, isActive: true, config: true },
    });
    const publicBase =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "(defina PUBLIC_APP_URL)";
    const evolutionHints = conns
      .filter((c) => c.provider === "EVOLUTION")
      .map((c) => {
        const cfg = c.config as Record<string, unknown>;
        const instanceName = String(cfg.instanceName ?? "");
        return {
          connectionId: c.id,
          instanceName,
          webhookPathEsperado: `${publicBase}/webhooks/whatsapp/evolution/${c.id}`,
          confiraNaEvolution:
            instanceName &&
            `GET webhook/find/${instanceName} — campo "url" deve ser idêntico ao webhookPathEsperado`,
        };
      });
    console.log(
      JSON.stringify(
        {
          tenant: t,
          whatsAppConnections: conns,
          evolutionWebhookCheck: evolutionHints,
          conversationCount: convCount,
          messageCount: msgCount,
          lastMessage: lastMsg,
        },
        null,
        2,
      ),
    );
    console.log("---");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
