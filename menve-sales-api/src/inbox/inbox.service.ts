import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async getInbox(tenantId: string) {
    const [whatsAppConnections, quickReplies, conversations] =
      await Promise.all([
        this.prisma.whatsAppConnection.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.quickReply.findMany({
          where: { tenantId },
          orderBy: { sortOrder: "asc" },
        }),
        this.prisma.conversation.findMany({
          where: { tenantId },
          orderBy: { lastMessageAt: "desc" },
          include: {
            contact: {
              include: {
                deals: {
                  where: { status: "OPEN" },
                  orderBy: { updatedAt: "desc" },
                  take: 8,
                  include: {
                    pipeline: { select: { id: true, name: true } },
                    stage: {
                      select: { id: true, name: true, color: true },
                    },
                  },
                },
              },
            },
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
    return { whatsAppConnections, quickReplies, conversations };
  }
}
