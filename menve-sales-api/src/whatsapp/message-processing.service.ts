import { Injectable, Optional } from "@nestjs/common";
import {
  ConversationStatus,
  MessageAckStatus,
  MessageDirection,
  type WhatsAppConnection,
  WhatsAppProvider,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutreachService } from "../outreach/outreach.service";
import { extractEvolutionMessageAckUpdates } from "./evolution-provider";
import type { EvolutionMessageAckLevel } from "./evolution-provider";
import { createWhatsAppProvider } from "./factory";
import type { NormalizedInbound, OutboundMediaKind } from "./provider.interface";

function ackPrismaRank(s: MessageAckStatus): number {
  switch (s) {
    case MessageAckStatus.READ:
      return 3;
    case MessageAckStatus.DELIVERED:
      return 2;
    default:
      return 1;
  }
}

function ackLevelToPrisma(level: EvolutionMessageAckLevel): MessageAckStatus {
  switch (level) {
    case "read":
      return MessageAckStatus.READ;
    case "delivered":
      return MessageAckStatus.DELIVERED;
    default:
      return MessageAckStatus.SENT;
  }
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return `+${digits}`;
  return raw;
}

@Injectable()
export class MessageProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outreach?: OutreachService,
  ) {}

  async processInboundWhatsApp(args: {
    tenantId: string;
    connectionId: string;
    inbound: NormalizedInbound;
  }) {
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: args.connectionId, tenantId: args.tenantId },
    });
    if (!conn) return { ok: false as const, error: "connection" as const };

    if (!conn.isActive) {
      await this.prisma.whatsAppConnection.update({
        where: { id: conn.id },
        data: { isActive: true },
      });
    }

    const phone = normalizePhone(args.inbound.from);
    const outboundFromDevice = args.inbound.fromMe === true;
    const remoteJid = args.inbound.debug?.remoteJid ?? "";
    const isGroupChat = remoteJid.endsWith("@g.us");

    let resolvedProfileName = args.inbound.profileName?.trim();
    if (outboundFromDevice || isGroupChat) {
      // fromMe: pushName/notify no payload costuma ser o número conectado (nós), não o cliente —
      // gravar isso renomeava outros leads para o mesmo nome (ex.: "Gabriel Nathan").
      // Grupo: pushName costuma ser do participante, não do título do grupo.
      resolvedProfileName = undefined;
    }

    const provider = createWhatsAppProvider(conn);
    let profilePhotoUrl: string | null =
      args.inbound.profilePhotoUrl?.trim() || null;
    if (outboundFromDevice) {
      profilePhotoUrl = null;
    }
    if (provider.getContactProfile) {
      const profile = await provider
        .getContactProfile(args.inbound.from)
        .catch(() => ({} as { name?: string; photoUrl?: string | null }));
      if (profile?.name && !resolvedProfileName) {
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
        });
      }
    }

    let contact = await this.prisma.contact.upsert({
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
      const prev =
        (contact.customData as Record<string, unknown> | null) ?? {};
      if (prev.whatsappProfilePhotoUrl !== profilePhotoUrl) {
        contact = await this.prisma.contact.update({
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

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId: args.tenantId,
        contactId: contact.id,
        whatsappConnectionId: conn.id,
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId: args.tenantId,
          contactId: contact.id,
          whatsappConnectionId: conn.id,
          status: outboundFromDevice
            ? ConversationStatus.IN_PROGRESS
            : ConversationStatus.WAITING,
          lastMessageAt: args.inbound.timestamp,
        },
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: args.inbound.timestamp,
          status: ConversationStatus.IN_PROGRESS,
        },
      });
    }

    if (args.inbound.externalId) {
      const duplicated = await this.prisma.message.findFirst({
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

    let mediaUrl: string | null = args.inbound.mediaUrl ?? null;
    let mediaType: string | null = args.inbound.mediaType ?? null;

    const fetchFn = provider.fetchInboundMediaBase64;
    if (
      !mediaUrl &&
      args.inbound.body === "[Áudio]" &&
      conn.provider === WhatsAppProvider.EVOLUTION &&
      typeof fetchFn === "function"
    ) {
      const remoteJid = args.inbound.debug?.remoteJid;
      const keyId = args.inbound.whatsappKeyId;
      if (remoteJid && keyId) {
        const fetched = await fetchFn({
          keyId,
          remoteJid,
        }).catch(() => null);
        if (fetched?.base64) {
          const mime =
            fetched.mimetype?.split(";")[0]?.trim() ?? mediaType ?? "audio/ogg";
          const raw = fetched.base64.trim();
          mediaUrl = raw.startsWith("data:")
            ? raw
            : `data:${mime};base64,${raw}`;
          mediaType = mime;
        }
      }
    }

    const direction = outboundFromDevice
      ? MessageDirection.OUTBOUND
      : MessageDirection.INBOUND;

    const outboundAck =
      outboundFromDevice && conn.provider === WhatsAppProvider.EVOLUTION
        ? MessageAckStatus.SENT
        : outboundFromDevice
          ? MessageAckStatus.DELIVERED
          : null;

    await this.prisma.message.create({
      data: {
        tenantId: args.tenantId,
        whatsappConnectionId: conn.id,
        conversationId: conversation.id,
        contactId: contact.id,
        userId: null,
        direction,
        body: args.inbound.body,
        externalId: args.inbound.externalId,
        mediaUrl,
        mediaType,
        ackStatus: outboundAck,
        createdAt: args.inbound.timestamp,
      },
    });

    if (!outboundFromDevice && this.outreach) {
      void this.outreach
        .handleInboundReply({
          tenantId: args.tenantId,
          phone,
          contactId: contact.id,
          conversationId: conversation.id,
          messageId: args.inbound.externalId,
        })
        .catch(() => {
          /* não bloquear webhook */
        });
    }

    // Só quando o cliente envia mensagem: marcar mensagens nossas anteriores como lidas por ele.
    if (!outboundFromDevice) {
      await this.prisma.message.updateMany({
        where: {
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          createdAt: { lt: args.inbound.timestamp },
          OR: [
            { ackStatus: MessageAckStatus.SENT },
            { ackStatus: MessageAckStatus.DELIVERED },
            { ackStatus: null },
          ],
        },
        data: { ackStatus: MessageAckStatus.READ },
      });
    }

    if (!outboundFromDevice && this.outreach) {
      await this.outreach
        .handleInboundOptOut(args.tenantId, phone, args.inbound.body)
        .catch(() => 0);
    }

    return { ok: true as const };
  }

  /** Webhook Evolution `messages.update`: avança ACK só para cima (SENT→DELIVERED→READ). */
  async processEvolutionMessageAckUpdates(args: {
    tenantId: string;
    connectionId: string;
    payload: unknown;
  }): Promise<number> {
    const updates = extractEvolutionMessageAckUpdates(args.payload);
    let n = 0;
    for (const u of updates) {
      const next = ackLevelToPrisma(u.level);
      const rows = await this.prisma.message.findMany({
        where: {
          tenantId: args.tenantId,
          whatsappConnectionId: args.connectionId,
          externalId: u.externalId,
          direction: MessageDirection.OUTBOUND,
        },
        select: { id: true, ackStatus: true },
      });
      for (const row of rows) {
        const cur = row.ackStatus ?? MessageAckStatus.SENT;
        const curRank = ackPrismaRank(cur);
        const nextRank = ackPrismaRank(next);
        if (nextRank > curRank) {
          await this.prisma.message.update({
            where: { id: row.id },
            data: { ackStatus: next },
          });
          n += 1;
        }
      }
    }
    return n;
  }

  private async recordOutboundMessage(args: {
    tenantId: string;
    userId: string;
    toPhone: string;
    conn: WhatsAppConnection;
    body: string;
    externalId?: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
    /** Inbox (e outros UIs com `conversationId`): evita upsert + 2ª busca de conversa. */
    conversationId?: string;
  }): Promise<{ ok: true } | { ok: true; duplicated: true }> {
    const phone = normalizePhone(args.toPhone);

    let conversation: { id: string };
    let contactId: string;

    if (args.conversationId) {
      const row = await this.prisma.conversation.findFirst({
        where: {
          id: args.conversationId,
          tenantId: args.tenantId,
          whatsappConnectionId: args.conn.id,
        },
        include: {
          contact: { select: { id: true, phone: true } },
        },
      });
      if (!row) {
        throw new Error("Conversa não encontrada");
      }
      if (!row.contact.phone?.trim()) {
        throw new Error("Contato sem telefone");
      }
      const rowPhone = normalizePhone(row.contact.phone);
      if (rowPhone !== phone) {
        throw new Error("Telefone não confere com o contato da conversa");
      }
      await this.prisma.conversation.update({
        where: { id: row.id },
        data: { lastMessageAt: new Date(), assignedUserId: args.userId },
      });
      conversation = { id: row.id };
      contactId = row.contactId;
    } else {
      const contact = await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId: args.tenantId, phone } },
        create: {
          tenantId: args.tenantId,
          name: phone,
          phone,
        },
        update: {},
      });

      let conv = await this.prisma.conversation.findFirst({
        where: {
          tenantId: args.tenantId,
          contactId: contact.id,
          whatsappConnectionId: args.conn.id,
        },
      });

      if (!conv) {
        conv = await this.prisma.conversation.create({
          data: {
            tenantId: args.tenantId,
            contactId: contact.id,
            whatsappConnectionId: args.conn.id,
            status: ConversationStatus.IN_PROGRESS,
            assignedUserId: args.userId,
            lastMessageAt: new Date(),
          },
        });
      } else {
        await this.prisma.conversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: new Date(), assignedUserId: args.userId },
        });
      }
      conversation = { id: conv.id };
      contactId = contact.id;
    }

    if (args.externalId) {
      const duplicated = await this.prisma.message.findFirst({
        where: {
          tenantId: args.tenantId,
          whatsappConnectionId: args.conn.id,
          externalId: args.externalId,
        },
        select: { id: true },
      });
      if (duplicated) {
        return { ok: true as const, duplicated: true as const };
      }
    }

    const initialAck =
      args.conn.provider === WhatsAppProvider.EVOLUTION
        ? MessageAckStatus.SENT
        : MessageAckStatus.DELIVERED;

    await this.prisma.message.create({
      data: {
        tenantId: args.tenantId,
        whatsappConnectionId: args.conn.id,
        conversationId: conversation.id,
        contactId,
        userId: args.userId,
        direction: MessageDirection.OUTBOUND,
        body: args.body,
        externalId: args.externalId,
        mediaUrl: args.mediaUrl ?? null,
        mediaType: args.mediaType ?? null,
        ackStatus: initialAck,
      },
    });

    return { ok: true as const };
  }

  async sendOutboundText(args: {
    tenantId: string;
    connectionId: string;
    userId: string;
    toPhone: string;
    text: string;
    conversationId?: string;
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

    return this.recordOutboundMessage({
      tenantId: args.tenantId,
      userId: args.userId,
      toPhone: args.toPhone,
      conn,
      body: args.text,
      externalId: sent.externalId,
      conversationId: args.conversationId,
    });
  }

  async sendOutboundMedia(args: {
    tenantId: string;
    connectionId: string;
    userId: string;
    toPhone: string;
    kind: OutboundMediaKind;
    base64: string;
    mimeType: string;
    fileName?: string;
    caption?: string;
    conversationId?: string;
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
    if (!provider.sendOutboundMedia) {
      throw new Error("Este canal não suporta envio de áudio ou anexos");
    }

    const sent = await provider.sendOutboundMedia({
      to: args.toPhone,
      kind: args.kind,
      base64: args.base64,
      mimeType: args.mimeType,
      fileName: args.fileName,
      caption: args.caption,
    });
    if (!sent.ok) throw new Error(sent.error ?? "Falha ao enviar mídia");

    const body =
      args.kind === "audio"
        ? "[Áudio]"
        : args.kind === "image"
          ? (args.caption?.trim() || "[Imagem]")
          : `[Documento] ${args.fileName?.trim() || "arquivo"}`;

    const rawB64 = args.base64.trim().replace(/^data:[^;]+;base64,/i, "");
    const dataUrl = `data:${args.mimeType};base64,${rawB64}`;

    return this.recordOutboundMessage({
      tenantId: args.tenantId,
      userId: args.userId,
      toPhone: args.toPhone,
      conn,
      body,
      externalId: sent.externalId,
      mediaUrl: dataUrl,
      mediaType: args.mimeType,
      conversationId: args.conversationId,
    });
  }

  async sendOutboundTemplate(args: {
    tenantId: string;
    connectionId: string;
    userId: string;
    toPhone: string;
    templateName: string;
    language: string;
    components?: unknown[];
    conversationId?: string;
  }) {
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: {
        id: args.connectionId,
        tenantId: args.tenantId,
        isActive: true,
      },
    });
    if (!conn) throw new Error("Conexão não encontrada");
    if (conn.provider !== "META") {
      throw new Error("Templates só são suportados na API Oficial (Meta)");
    }
    const provider = createWhatsAppProvider(conn);
    if (!provider.sendTemplate) {
      throw new Error("Este canal não suporta envio de template");
    }
    const sent = await provider.sendTemplate(
      args.toPhone,
      args.templateName,
      args.language,
      args.components,
    );
    if (!sent.ok) throw new Error(sent.error ?? "Falha ao enviar template");
    const body = `[Template] ${args.templateName} (${args.language})`;
    return this.recordOutboundMessage({
      tenantId: args.tenantId,
      userId: args.userId,
      toPhone: args.toPhone,
      conn,
      body,
      externalId: sent.externalId,
      conversationId: args.conversationId,
    });
  }
}
