import prisma from "@/lib/prisma";
import { ConversationStatus, MessageDirection } from "@prisma/client";
import { createWhatsAppProvider } from "./factory";
import type { NormalizedInbound } from "./provider.interface";

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return `+${digits}`;
  return raw;
}

export async function processInboundWhatsApp(args: {
  tenantId: string;
  connectionId: string;
  inbound: NormalizedInbound;
}) {
  const conn = await prisma.whatsAppConnection.findFirst({
    where: { id: args.connectionId, tenantId: args.tenantId },
  });
  if (!conn) return { ok: false as const, error: "connection" };

  // Webhook prova que a linha está viva; ativa se ainda estiver false (ex.: polling não atualizou).
  if (!conn.isActive) {
    await prisma.whatsAppConnection.update({
      where: { id: conn.id },
      data: { isActive: true },
    });
  }

  const phone = normalizePhone(args.inbound.from);

  const contact = await prisma.contact.upsert({
    where: {
      tenantId_phone: { tenantId: args.tenantId, phone },
    },
    create: {
      tenantId: args.tenantId,
      name: phone,
      phone,
    },
    update: {},
  });

  let conversation = await prisma.conversation.findFirst({
    where: {
      tenantId: args.tenantId,
      contactId: contact.id,
      whatsappConnectionId: conn.id,
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: args.tenantId,
        contactId: contact.id,
        whatsappConnectionId: conn.id,
        status: ConversationStatus.WAITING,
        lastMessageAt: args.inbound.timestamp,
      },
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: args.inbound.timestamp,
        status: ConversationStatus.IN_PROGRESS,
      },
    });
  }

  await prisma.message.create({
    data: {
      tenantId: args.tenantId,
      whatsappConnectionId: conn.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: MessageDirection.INBOUND,
      body: args.inbound.body,
      externalId: args.inbound.externalId,
      createdAt: args.inbound.timestamp,
    },
  });

  return { ok: true as const };
}

export async function sendOutboundText(args: {
  tenantId: string;
  connectionId: string;
  userId: string;
  toPhone: string;
  text: string;
}) {
  const conn = await prisma.whatsAppConnection.findFirst({
    where: { id: args.connectionId, tenantId: args.tenantId, isActive: true },
  });
  if (!conn) throw new Error("Conexão não encontrada");

  const provider = createWhatsAppProvider(conn);
  const sent = await provider.sendTextMessage(args.toPhone, args.text);
  if (!sent.ok) throw new Error(sent.error ?? "Falha ao enviar");

  const phone = normalizePhone(args.toPhone);
  const contact = await prisma.contact.upsert({
    where: { tenantId_phone: { tenantId: args.tenantId, phone } },
    create: {
      tenantId: args.tenantId,
      name: phone,
      phone,
    },
    update: {},
  });

  let conversation = await prisma.conversation.findFirst({
    where: {
      tenantId: args.tenantId,
      contactId: contact.id,
      whatsappConnectionId: conn.id,
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: args.tenantId,
        contactId: contact.id,
        whatsappConnectionId: conn.id,
        status: ConversationStatus.IN_PROGRESS,
        assignedUserId: args.userId,
        lastMessageAt: new Date(),
      },
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), assignedUserId: args.userId },
    });
  }

  await prisma.message.create({
    data: {
      tenantId: args.tenantId,
      whatsappConnectionId: conn.id,
      conversationId: conversation.id,
      contactId: contact.id,
      userId: args.userId,
      direction: MessageDirection.OUTBOUND,
      body: args.text,
      externalId: sent.externalId,
    },
  });

  return { ok: true as const };
}
