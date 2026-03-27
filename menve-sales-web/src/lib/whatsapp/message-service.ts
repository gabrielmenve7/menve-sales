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
  let resolvedProfileName = args.inbound.profileName?.trim();
  const provider = createWhatsAppProvider(conn);
  let profilePhotoUrl: string | null = args.inbound.profilePhotoUrl?.trim() || null;
  if (provider.getContactProfile) {
    const profile = await provider.getContactProfile(args.inbound.from).catch(
      () => ({} as { name?: string; photoUrl?: string | null }),
    );
    if (profile?.name && !resolvedProfileName) {
      // keep payload name as priority, fallback to provider lookup.
      resolvedProfileName = profile.name.trim();
    }
    profilePhotoUrl = profile?.photoUrl ?? profilePhotoUrl;
  }

  if (process.env.NODE_ENV === "production") {
    if (!resolvedProfileName || !profilePhotoUrl) {
      console.warn("[whatsapp:inbound-profile]", {
        tenantId: args.tenantId,
        connectionId: args.connectionId,
        phone,
        resolvedProfileName: resolvedProfileName ?? null,
        profilePhotoUrl: profilePhotoUrl ?? null,
        payloadProfileName: args.inbound.profileName ?? null,
        payloadProfilePhotoUrl: args.inbound.profilePhotoUrl ?? null,
      });
    }
  }

  let contact = await prisma.contact.upsert({
    where: {
      tenantId_phone: { tenantId: args.tenantId, phone },
    },
    create: {
      tenantId: args.tenantId,
      name: resolvedProfileName || phone,
      phone,
      ...(profilePhotoUrl
        ? {
            customData: {
              whatsappProfilePhotoUrl: profilePhotoUrl,
              whatsappProfilePhotoUpdatedAt: new Date().toISOString(),
            },
          }
        : {}),
    },
    update: resolvedProfileName ? { name: resolvedProfileName } : {},
  });

  if (profilePhotoUrl) {
    const prev = (contact.customData as Record<string, unknown> | null) ?? {};
    if (prev.whatsappProfilePhotoUrl !== profilePhotoUrl) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          customData: {
            ...prev,
            whatsappProfilePhotoUrl: profilePhotoUrl,
            whatsappProfilePhotoUpdatedAt: new Date().toISOString(),
          },
        },
      });
    }
  }

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

  if (args.inbound.externalId) {
    const duplicated = await prisma.message.findFirst({
      where: {
        tenantId: args.tenantId,
        whatsappConnectionId: conn.id,
        externalId: args.inbound.externalId,
      },
      select: { id: true },
    });
    if (duplicated) {
      return { ok: true as const, duplicated: true as const };
    }
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

  if (sent.externalId) {
    const duplicated = await prisma.message.findFirst({
      where: {
        tenantId: args.tenantId,
        whatsappConnectionId: conn.id,
        externalId: sent.externalId,
      },
      select: { id: true },
    });
    if (duplicated) {
      return { ok: true as const, duplicated: true as const };
    }
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
