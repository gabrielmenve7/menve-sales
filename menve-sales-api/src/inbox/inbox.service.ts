import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConversationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Contato + deals abertos (lista e detalhe do inbox). */
const inboxContactInclude = {
  include: {
    deals: {
      where: { status: "OPEN" as const },
      orderBy: { updatedAt: "desc" as const },
      take: 8,
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: {
          select: { id: true, name: true, color: true },
        },
      },
    },
  },
} satisfies { include: Prisma.ContactInclude };

const inboxConversationIncludeBase = {
  contact: inboxContactInclude,
  whatsappConnection: true,
} satisfies Prisma.ConversationInclude;

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
    const [whatsAppConnections, quickReplyCategories, conversationsRaw] =
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
            ...inboxConversationIncludeBase,
            /* Só a última mensagem por conversa (preview na lista + deep link leve). */
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        }),
      ]);

    const conversations = conversationsRaw.map((c) => ({
      ...c,
      messages: [...c.messages].reverse(),
      internalNotes: [],
    }));

    return { whatsAppConnections, quickReplyCategories, conversations };
  }

  /**
   * Mensagens + notas + canal (sem re-carregar `contact`/deals — o web mescla com a linha da lista).
   * Reduz payload e joins vs. incluir contact completo a cada troca de conversa.
   */
  async getConversationForInbox(tenantId: string, conversationId: string) {
    const raw = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: {
        id: true,
        tenantId: true,
        contactId: true,
        whatsappConnectionId: true,
        assignedUserId: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
        whatsappConnection: true,
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
        internalNotes: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });
    if (!raw) {
      throw new NotFoundException("Conversa não encontrada");
    }
    return {
      ...raw,
      messages: [...raw.messages].reverse(),
    };
  }
}
