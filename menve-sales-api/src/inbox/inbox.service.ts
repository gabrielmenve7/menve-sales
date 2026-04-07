import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConversationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Garante uma linha de `Conversation` para o contato no canal WhatsApp ativo,
   * para o lead aparecer no Inbox e permitir a 1ª mensagem (ex.: vindo do funil com `?contact=`).
   */
  async ensureConversationForContact(
    tenantId: string,
    userId: string,
    contactId: string,
  ): Promise<{ conversationId: string; created: boolean }> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, phone: true },
    });
    if (!contact) {
      throw new NotFoundException("Contato não encontrado");
    }
    if (!contact.phone?.trim()) {
      throw new BadRequestException(
        "Contato sem telefone — cadastre o número para usar o WhatsApp no Inbox.",
      );
    }

    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!conn) {
      throw new BadRequestException(
        "Nenhum canal WhatsApp ativo. Conecte um canal em Configurações.",
      );
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        contactId,
        whatsappConnectionId: conn.id,
      },
      select: { id: true },
    });
    if (existing) {
      return { conversationId: existing.id, created: false };
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        contactId,
        whatsappConnectionId: conn.id,
        assignedUserId: userId,
        status: ConversationStatus.IN_PROGRESS,
        lastMessageAt: new Date(),
      },
    });

    return { conversationId: conversation.id, created: true };
  }

  async getInbox(tenantId: string) {
    const [whatsAppConnections, quickReplyCategories, conversations] =
      await Promise.all([
        this.prisma.whatsAppConnection.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.quickReplyCategory.findMany({
          where: { tenantId },
          orderBy: { sortOrder: "asc" },
          include: {
            replies: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                title: true,
                body: true,
                sortOrder: true,
              },
            },
          },
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
    return { whatsAppConnections, quickReplyCategories, conversations };
  }
}
