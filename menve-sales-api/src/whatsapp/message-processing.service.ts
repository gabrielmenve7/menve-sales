import { BadRequestException, Injectable, Optional, Inject, forwardRef } from "@nestjs/common";
import {
  ConversationStatus,
  MessageAckStatus,
  MessageDirection,
  MessageSenderType,
  Prisma,
  type WhatsAppConnection,
  WhatsAppProvider,
} from "@prisma/client";
import { LarissaOrchestratorService } from "../agents/larissa-orchestrator.service";
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
  const trimmed = raw.trim();
  if (trimmed.startsWith("lid:")) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13) return `+${digits}`;
  return trimmed;
}

function plausiblePhoneDigits(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 13;
}

function digitsFromJidOrPhone(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  let local = s.includes("@") ? (s.split("@")[0] ?? "") : s;
  if (local.includes(":")) local = local.split(":")[0] ?? local;
  return local.replace(/\D/g, "");
}

/** Quando o contato tem LID ou número errado, usa JID alternativo salvo no inbound. */
function resolveOutboundWhatsAppTarget(
  contactPhone: string,
  customData: unknown,
  toPhoneHint: string,
): string {
  const cd = (customData as Record<string, unknown> | null) ?? {};
  const normalized = normalizePhone(contactPhone);
  const digits = normalized.replace(/\D/g, "");
  const isLid = normalized.startsWith("lid:");

  if (!isLid && plausiblePhoneDigits(digits)) {
    return digits;
  }

  for (const key of ["whatsappRemoteJidAlt", "whatsappRemoteJid"] as const) {
    const jid = cd[key];
    if (typeof jid !== "string" || !jid.trim()) continue;
    const d = digitsFromJidOrPhone(jid);
    if (plausiblePhoneDigits(d)) return d;
  }

  const hintDigits = toPhoneHint.replace(/\D/g, "");
  if (plausiblePhoneDigits(hintDigits)) return hintDigits;

  throw new BadRequestException(
    "Telefone do contato inválido para envio. Apague esta conversa e peça ao cliente para enviar uma nova mensagem.",
  );
}

function isInboundMediaPlaceholder(body: string): boolean {
  return (
    body === "[Áudio]" ||
    body === "[Imagem]" ||
    body === "[Mídia]" ||
    body === "[Documento]"
  );
}

function applyFetchedInboundMedia(
  fetched: { base64?: string; url?: string; mimetype?: string } | null,
  fallbackType: string | null,
): { mediaUrl: string | null; mediaType: string | null } {
  if (!fetched) return { mediaUrl: null, mediaType: fallbackType };
  if (fetched.url) {
    return {
      mediaUrl: fetched.url,
      mediaType:
        fetched.mimetype?.split(";")[0]?.trim() ?? fallbackType ?? "audio/mpeg",
    };
  }
  if (fetched.base64) {
    const mime =
      fetched.mimetype?.split(";")[0]?.trim() ?? fallbackType ?? "audio/ogg";
    const raw = fetched.base64.trim();
    return {
      mediaUrl: raw.startsWith("data:") ? raw : `data:${mime};base64,${raw}`,
      mediaType: mime,
    };
  }
  return { mediaUrl: null, mediaType: fallbackType };
}

@Injectable()
export class MessageProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outreach?: OutreachService,
    @Optional()
    @Inject(forwardRef(() => LarissaOrchestratorService))
    private readonly larissa?: LarissaOrchestratorService,
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

    const remoteJidInbound = args.inbound.debug?.remoteJid?.trim();
    const remoteJidAltInbound = args.inbound.debug?.remoteJidAlt?.trim();
    if (remoteJidInbound || remoteJidAltInbound) {
      const prev =
        (contact.customData as Record<string, unknown> | null) ?? {};
      const patch: Record<string, unknown> = { ...prev };
      if (remoteJidInbound) patch.whatsappRemoteJid = remoteJidInbound;
      if (remoteJidAltInbound) patch.whatsappRemoteJidAlt = remoteJidAltInbound;
      if (
        patch.whatsappRemoteJid !== prev.whatsappRemoteJid ||
        patch.whatsappRemoteJidAlt !== prev.whatsappRemoteJidAlt
      ) {
        contact = await this.prisma.contact.update({
          where: { id: contact.id },
          data: { customData: patch as Prisma.InputJsonValue },
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

    const needsMediaFetch = !mediaUrl && isInboundMediaPlaceholder(args.inbound.body);
    if (
      needsMediaFetch &&
      (conn.provider === WhatsAppProvider.EVOLUTION ||
        conn.provider === WhatsAppProvider.ZAPPFY) &&
      typeof provider.fetchInboundMediaBase64 === "function"
    ) {
      const keyId =
        args.inbound.whatsappKeyId?.trim() ||
        args.inbound.externalId?.trim() ||
        undefined;
      const remoteJid = args.inbound.debug?.remoteJid?.trim();
      const remoteJidAlt = args.inbound.debug?.remoteJidAlt?.trim();
      if (keyId && (remoteJid || remoteJidAlt || conn.provider === WhatsAppProvider.ZAPPFY)) {
        const fetched = await provider.fetchInboundMediaBase64({
          keyId,
          keyIdAlt: args.inbound.debug?.keyIdAlt,
          downloadIds: args.inbound.debug?.downloadIds,
          remoteJid: remoteJid ?? remoteJidAlt ?? "",
          remoteJidAlt,
          retryDelaysMs:
            conn.provider === WhatsAppProvider.ZAPPFY ? [500, 2_000] : undefined,
        }).catch(() => null);
        const resolved = applyFetchedInboundMedia(fetched, mediaType);
        mediaUrl = resolved.mediaUrl;
        mediaType = resolved.mediaType;
        if (!mediaUrl) {
          console.warn("[whatsapp:inbound-media]", {
            tenantId: args.tenantId,
            connectionId: conn.id,
            keyId,
            keyIdAlt: args.inbound.debug?.keyIdAlt ?? null,
            downloadIds: args.inbound.debug?.downloadIds ?? null,
            body: args.inbound.body,
            provider: conn.provider,
          });
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

    const senderType = outboundFromDevice
      ? MessageSenderType.HUMAN_AGENT
      : MessageSenderType.LEAD;

    const created = await this.prisma.message.create({
      data: {
        tenantId: args.tenantId,
        whatsappConnectionId: conn.id,
        conversationId: conversation.id,
        contactId: contact.id,
        userId: null,
        direction,
        senderType,
        body: args.inbound.body,
        externalId: args.inbound.externalId,
        mediaUrl,
        mediaType,
        ackStatus: outboundAck,
        createdAt: args.inbound.timestamp,
      },
    });

    if (!mediaUrl && needsMediaFetch) {
      void this.scheduleInboundMediaHydration({
        messageId: created.id,
        tenantId: args.tenantId,
        connectionId: conn.id,
        inbound: args.inbound,
      });
    }

    if (!outboundFromDevice && this.outreach) {
      const reply = await this.outreach
        .handleInboundReply({
          tenantId: args.tenantId,
          phone,
          contactId: contact.id,
          conversationId: conversation.id,
          messageId: args.inbound.externalId,
        })
        .catch(() => ({ updated: false as const, recipientId: null as string | null }));

      if (reply.updated && this.larissa) {
        void this.larissa
          .activateOnInboundReply({
            tenantId: args.tenantId,
            conversationId: conversation.id,
            contactId: contact.id,
            outreachRecipientId: reply.recipientId,
          })
          .catch(() => undefined);
      }
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

  /** Tenta baixar mídia faltante ao abrir conversa no Inbox. */
  async hydrateMessagesForConversation(tenantId: string, conversationId: string) {
    const pending = await this.prisma.message.findMany({
      where: {
        tenantId,
        conversationId,
        mediaUrl: null,
        body: { in: ["[Áudio]", "[Imagem]", "[Mídia]", "[Documento]"] },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        tenantId: true,
        body: true,
        externalId: true,
        mediaType: true,
        whatsappConnectionId: true,
      },
    });
    for (const msg of pending) {
      await this.hydrateStoredMessage(msg).catch(() => undefined);
    }
  }

  private scheduleInboundMediaHydration(args: {
    messageId: string;
    tenantId: string;
    connectionId: string;
    inbound: NormalizedInbound;
  }) {
    void (async () => {
      for (const delayMs of [4_000, 10_000, 20_000]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const row = await this.prisma.message.findFirst({
          where: { id: args.messageId, tenantId: args.tenantId },
          select: { mediaUrl: true },
        });
        if (row?.mediaUrl) return;

        const hydrated = await this.hydrateStoredMessage({
          id: args.messageId,
          tenantId: args.tenantId,
          body: args.inbound.body,
          externalId: args.inbound.externalId,
          mediaType: args.inbound.mediaType ?? null,
          whatsappConnectionId: args.connectionId,
          downloadIds: args.inbound.debug?.downloadIds,
          remoteJid: args.inbound.debug?.remoteJid,
          remoteJidAlt: args.inbound.debug?.remoteJidAlt,
          whatsappKeyId: args.inbound.whatsappKeyId,
        }).catch(() => false);
        if (hydrated) return;
      }
    })();
  }

  private async hydrateStoredMessage(msg: {
    id: string;
    tenantId: string;
    body: string;
    externalId: string | null;
    mediaType: string | null;
    whatsappConnectionId: string | null;
    downloadIds?: string[];
    remoteJid?: string;
    remoteJidAlt?: string;
    whatsappKeyId?: string;
  }): Promise<boolean> {
    if (!isInboundMediaPlaceholder(msg.body)) return false;

    const existing = await this.prisma.message.findFirst({
      where: { id: msg.id, tenantId: msg.tenantId },
      select: { mediaUrl: true },
    });
    if (existing?.mediaUrl) return true;

    const connectionId = msg.whatsappConnectionId;
    if (!connectionId) return false;

    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id: connectionId, tenantId: msg.tenantId },
    });
    if (
      !conn ||
      (conn.provider !== WhatsAppProvider.EVOLUTION &&
        conn.provider !== WhatsAppProvider.ZAPPFY)
    ) {
      return false;
    }

    const provider = createWhatsAppProvider(conn);
    if (typeof provider.fetchInboundMediaBase64 !== "function") return false;

    const keyId =
      msg.whatsappKeyId?.trim() || msg.externalId?.trim() || undefined;
    if (!keyId) return false;

    const fetched = await provider.fetchInboundMediaBase64({
      keyId,
      downloadIds:
        msg.downloadIds ??
        (msg.externalId?.includes(":") ? [msg.externalId] : undefined),
      remoteJid: msg.remoteJid ?? "",
      remoteJidAlt: msg.remoteJidAlt,
      retryDelaysMs: [0, 1_500, 4_000],
    }).catch(() => null);

    const resolved = applyFetchedInboundMedia(fetched, msg.mediaType);
    if (!resolved.mediaUrl) return false;

    await this.prisma.message.update({
      where: { id: msg.id },
      data: {
        mediaUrl: resolved.mediaUrl,
        mediaType: resolved.mediaType,
      },
    });
    return true;
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
          contact: { select: { id: true, phone: true, customData: true } },
        },
      });
      if (!row) {
        throw new BadRequestException("Conversa não encontrada");
      }
      if (!row.contact.phone?.trim()) {
        throw new BadRequestException("Contato sem telefone");
      }
      const rowPhone = normalizePhone(row.contact.phone);
      const requestedPhone = normalizePhone(args.toPhone);
      if (rowPhone !== requestedPhone && !rowPhone.startsWith("lid:")) {
        throw new BadRequestException(
          "Telefone não confere com o contato da conversa",
        );
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
        senderType: MessageSenderType.HUMAN_AGENT,
        body: args.body,
        externalId: args.externalId,
        mediaUrl: args.mediaUrl ?? null,
        mediaType: args.mediaType ?? null,
        ackStatus: initialAck,
      },
    });

    return { ok: true as const };
  }

  private async resolveSendTarget(args: {
    tenantId: string;
    connectionId: string;
    toPhone: string;
    conversationId?: string;
  }): Promise<string> {
    if (!args.conversationId) {
      const d = args.toPhone.replace(/\D/g, "");
      if (!plausiblePhoneDigits(d)) {
        throw new BadRequestException("Telefone de destino inválido");
      }
      return d;
    }
    const row = await this.prisma.conversation.findFirst({
      where: {
        id: args.conversationId,
        tenantId: args.tenantId,
        whatsappConnectionId: args.connectionId,
      },
      include: { contact: { select: { phone: true, customData: true } } },
    });
    if (!row?.contact.phone?.trim()) {
      throw new BadRequestException("Conversa ou contato não encontrado");
    }
    return resolveOutboundWhatsAppTarget(
      row.contact.phone,
      row.contact.customData,
      args.toPhone,
    );
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
    if (!conn) throw new BadRequestException("Conexão não encontrada");

    const sendTo = await this.resolveSendTarget({
      tenantId: args.tenantId,
      connectionId: args.connectionId,
      toPhone: args.toPhone,
      conversationId: args.conversationId,
    });

    const provider = createWhatsAppProvider(conn);
    const sent = await provider.sendTextMessage(sendTo, args.text);
    if (!sent.ok) {
      throw new BadRequestException(sent.error ?? "Falha ao enviar");
    }

    return this.recordOutboundMessage({
      tenantId: args.tenantId,
      userId: args.userId,
      toPhone: `+${sendTo}`,
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
    if (!conn) throw new BadRequestException("Conexão não encontrada");

    const sendTo = await this.resolveSendTarget({
      tenantId: args.tenantId,
      connectionId: args.connectionId,
      toPhone: args.toPhone,
      conversationId: args.conversationId,
    });

    const provider = createWhatsAppProvider(conn);
    if (!provider.sendOutboundMedia) {
      throw new BadRequestException("Este canal não suporta envio de áudio ou anexos");
    }

    const sent = await provider.sendOutboundMedia({
      to: sendTo,
      kind: args.kind,
      base64: args.base64,
      mimeType: args.mimeType,
      fileName: args.fileName,
      caption: args.caption,
    });
    if (!sent.ok) {
      throw new BadRequestException(sent.error ?? "Falha ao enviar mídia");
    }

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
      toPhone: `+${sendTo}`,
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
