import { BadRequestException, Injectable } from "@nestjs/common";
import { ConversationQualificationMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MessageProcessingService } from "../whatsapp/message-processing.service";
import { z } from "zod";

const noteSchema = z.object({
  body: z.string().min(1).max(4000),
});

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessageProcessingService,
  ) {}

  async addNote(
    tenantId: string,
    userId: string,
    conversationId: string,
    input: unknown,
  ) {
    const data = noteSchema.parse(input);
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conv) throw new BadRequestException("Conversa não encontrada");
    await this.prisma.internalNote.create({
      data: {
        conversationId,
        userId,
        body: data.body.trim(),
      },
    });
  }

  async sendMessage(
    tenantId: string,
    userId: string,
    conversationId: string,
    body: unknown,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { qualificationMode: true },
    });
    if (!conv) throw new BadRequestException("Conversa não encontrada");
    if (conv.qualificationMode === ConversationQualificationMode.AI_ACTIVE) {
      throw new BadRequestException(
        "Larissa está qualificando este lead. Use \"Assumir conversa\" para enviar mensagens.",
      );
    }

    const textMsg = z
      .object({
        connectionId: z.string().min(1),
        toPhone: z.string().min(1),
        text: z.string().min(1).max(8000),
      })
      .safeParse(body);

    if (textMsg.success) {
      await this.messages.sendOutboundText({
        tenantId,
        connectionId: textMsg.data.connectionId,
        userId,
        toPhone: textMsg.data.toPhone,
        text: textMsg.data.text,
        conversationId,
      });
      return;
    }

    const templateMsg = z
      .object({
        connectionId: z.string().min(1),
        toPhone: z.string().min(1),
        templateName: z.string().min(1).max(512),
        language: z.string().min(2).max(16),
        components: z.array(z.unknown()).optional(),
      })
      .safeParse(body);

    if (templateMsg.success) {
      await this.messages.sendOutboundTemplate({
        tenantId,
        connectionId: templateMsg.data.connectionId,
        userId,
        toPhone: templateMsg.data.toPhone,
        templateName: templateMsg.data.templateName,
        language: templateMsg.data.language,
        components: templateMsg.data.components,
        conversationId,
      });
      return;
    }

    const mediaMsg = z
      .object({
        connectionId: z.string().min(1),
        toPhone: z.string().min(1),
        mediaKind: z.enum(["audio", "image", "document"]),
        mediaDataUrl: z
          .string()
          .min(64)
          .max(18_000_000)
          .refine(
            (s) => /^data:[^;]+;base64,/i.test(s.replace(/\s/g, "")),
            "mediaDataUrl deve ser data URL base64",
          ),
        fileName: z.string().max(255).optional(),
        caption: z.string().max(2000).optional(),
      })
      .safeParse(body);

    if (!mediaMsg.success) {
      throw new BadRequestException(
        "Envie `text`, template (`templateName` + `language`), ou mídia (`mediaKind` + `mediaDataUrl`), com `connectionId` e `toPhone`.",
      );
    }

    const raw = mediaMsg.data.mediaDataUrl.replace(/\s/g, "");
    const m = /^data:([^;]+);base64,(.+)$/i.exec(raw);
    if (!m) throw new BadRequestException("mediaDataUrl inválido");
    const mimeType = m[1].split(";")[0].trim();
    const b64 = m[2];
    const approxBytes = (b64.length * 3) / 4;
    if (approxBytes > 14 * 1024 * 1024) {
      throw new BadRequestException("Arquivo muito grande (máx. ~14MB)");
    }

    await this.messages.sendOutboundMedia({
      tenantId,
      connectionId: mediaMsg.data.connectionId,
      userId,
      toPhone: mediaMsg.data.toPhone,
      kind: mediaMsg.data.mediaKind,
      base64: b64,
      mimeType,
      fileName: mediaMsg.data.fileName,
      caption: mediaMsg.data.caption,
      conversationId,
    });
  }
}
