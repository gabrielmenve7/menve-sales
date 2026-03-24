import prisma from "@/lib/prisma";
import { canConfigureTenant, getActiveTenantId } from "@/lib/session";
import { InboxClient } from "@/inbox";

export default async function InboxPage() {
  const tenantId = await getActiveTenantId();
  const canManageConnections = await canConfigureTenant();

  const [connections, quickReplies, conversations] = await Promise.all([
    prisma.whatsAppConnection.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quickReply.findMany({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        contact: true,
        whatsappConnection: true,
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
        internalNotes: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { user: { select: { name: true, email: true } } },
        },
      },
    }),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-semibold">WhatsApp Inbox</h1>
        <p className="text-muted-foreground">
          Conversas, respostas rápidas e notas internas (atualização a cada 5s).
        </p>
      </div>
      <InboxClient
        connections={connections}
        quickReplies={quickReplies}
        initialConversations={conversations}
        canManageConnections={canManageConnections}
      />
    </div>
  );
}
