import { Injectable } from "@nestjs/common";
import {
  ConversationStatus,
  MessageAckStatus,
  MessageDirection,
  MessageSenderType,
  WhatsAppProvider,
  type WhatsAppConnection,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { createWhatsAppProvider } from "../whatsapp/factory";

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return `+${digits}`;
  return raw;
}

@Injectable()
export class AiOutboundService {
  constructor(private readonly prisma: PrismaService) {}

  async sendText(args: {
    tenantId: string;
    connectionId: string;
    toPhone: string;
    text: string;
    conversationId: string;
    contactId: string;
    aiAgentId: string | null;
    agentRunId: string | null;
  }) {
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: {
        id: args.connectionId,
        tenantId: args.tenantId,
        isActive: true,
      },
    });
    if (!conn) throw new Error("Conexão não encontrada");

    const provider = createWhatsAppProvider(conn);
    const sent = await provider.sendTextMessage(args.toPhone, args.text);
    if (!sent.ok) throw new Error(sent.error ?? "Falha ao enviar");

    if (sent.externalId) {
      const dup = await this.prisma.message.findFirst({
        where: {
          tenantId: args.tenantId,
          whatsappConnectionId: conn.id,
          externalId: sent.externalId,
        },
      });
      if (dup) return { ok: true as const, duplicated: true as const };
    }

    const initialAck =
      conn.provider === WhatsAppProvider.EVOLUTION
        ? MessageAckStatus.SENT
        : MessageAckStatus.DELIVERED;

    await this.prisma.message.create({
      data: {
        tenantId: args.tenantId,
        whatsappConnectionId: conn.id,
        conversationId: args.conversationId,
        contactId: args.contactId,
        userId: null,
        direction: MessageDirection.OUTBOUND,
        senderType: MessageSenderType.AI_AGENT,
        aiAgentId: args.aiAgentId,
        agentRunId: args.agentRunId,
        body: args.text,
        externalId: sent.externalId,
        ackStatus: initialAck,
      },
    });

    await this.prisma.conversation.update({
      where: { id: args.conversationId },
      data: {
        lastMessageAt: new Date(),
        status: ConversationStatus.IN_PROGRESS,
      },
    });

    return { ok: true as const };
  }

  async persistCampaignMessage(args: {
    tenantId: string;
    conn: WhatsAppConnection;
    contactId: string;
    conversationId: string;
    body: string;
    externalId?: string;
    outreachCampaignId: string;
    userId: string;
  }) {
    if (args.externalId) {
      const dup = await this.prisma.message.findFirst({
        where: {
          tenantId: args.tenantId,
          whatsappConnectionId: args.conn.id,
          externalId: args.externalId,
        },
      });
      if (dup) return;
    }

    const initialAck =
      args.conn.provider === WhatsAppProvider.EVOLUTION
        ? MessageAckStatus.SENT
        : MessageAckStatus.DELIVERED;

    await this.prisma.message.create({
      data: {
        tenantId: args.tenantId,
        whatsappConnectionId: args.conn.id,
        conversationId: args.conversationId,
        contactId: args.contactId,
        userId: args.userId,
        direction: MessageDirection.OUTBOUND,
        senderType: MessageSenderType.CAMPAIGN,
        outreachCampaignId: args.outreachCampaignId,
        body: args.body,
        externalId: args.externalId,
        ackStatus: initialAck,
      },
    });

    await this.prisma.conversation.update({
      where: { id: args.conversationId },
      data: {
        lastMessageAt: new Date(),
        status: ConversationStatus.IN_PROGRESS,
      },
    });
  }

  async ensureConversation(args: {
    tenantId: string;
    contactId: string;
    connectionId: string;
  }) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId: args.tenantId,
        contactId: args.contactId,
        whatsappConnectionId: args.connectionId,
      },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        tenantId: args.tenantId,
        contactId: args.contactId,
        whatsappConnectionId: args.connectionId,
        status: ConversationStatus.IN_PROGRESS,
        lastMessageAt: new Date(),
      },
    });
  }
}
