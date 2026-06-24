import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OutreachRecipientStatus,
  type Prisma,
} from "@prisma/client";
import { GoogleCalendarService } from "../../google-calendar/google-calendar.service";
import { AiOutboundService } from "../ai-outbound.service";
import { HandoffService } from "../handoff.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { ToolContext, ToolHandler } from "./tool-types";

@Injectable()
export class GabrielToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiOutbound: AiOutboundService,
    private readonly calendar: GoogleCalendarService,
    private readonly handoff: HandoffService,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return {
      send_whatsapp_message: (ctx, args) =>
        this.sendWhatsApp(ctx, args),
      schedule_google_meet: (ctx, args) =>
        this.scheduleMeet(ctx, args),
      handoff_to_human: (ctx, args) =>
        this.handoffHuman(ctx, args),
      update_qualification_notes: (ctx, args) =>
        this.updateNotes(ctx, args),
      mark_opt_out: (ctx, args) => this.markOptOut(ctx, args),
    };
  }

  private async getConversation(ctx: ToolContext) {
    const row = await this.prisma.conversation.findFirst({
      where: { id: ctx.conversationId, tenantId: ctx.tenantId },
      include: {
        contact: { select: { id: true, phone: true, name: true, customData: true } },
        whatsappConnection: true,
      },
    });
    if (!row) throw new NotFoundException("Conversa não encontrada");
    return row;
  }

  private async resolveCalendarUserId(tenantId: string): Promise<string> {
    const membership = await this.prisma.workspaceMembership.findFirst({
      where: {
        tenantId,
        role: { in: ["OWNER", "ADMIN", "MANAGER"] },
        user: { googleCalendar: { isNot: null } },
      },
      select: { userId: true },
      orderBy: { joinedAt: "asc" },
    });
    if (membership?.userId) return membership.userId;

    const any = await this.prisma.userGoogleCalendar.findFirst({
      include: {
        user: {
          include: {
            workspaceMemberships: {
              where: { tenantId },
              take: 1,
            },
          },
        },
      },
    });
    if (any?.userId && any.user.workspaceMemberships.length > 0) {
      return any.userId;
    }

    throw new BadRequestException(
      "Nenhum usuário com Google Calendar conectado neste workspace",
    );
  }

  private async sendWhatsApp(
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<string> {
    const text = String(args.text ?? "").trim();
    if (!text) throw new BadRequestException("text obrigatório");

    const conv = await this.getConversation(ctx);
    const phone = conv.contact.phone?.trim();
    if (!phone) throw new BadRequestException("Contato sem telefone");

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: "gabriel" },
    });

    await this.aiOutbound.sendText({
      tenantId: ctx.tenantId,
      connectionId: conv.whatsappConnectionId,
      toPhone: phone,
      text,
      conversationId: ctx.conversationId,
      contactId: conv.contactId,
      aiAgentId: agent?.id ?? null,
      agentRunId: ctx.agentRunId,
    });

    return "Mensagem enviada";
  }

  private async scheduleMeet(
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<string> {
    const email = String(args.attendeeEmail ?? "").trim();
    const dueAt = String(args.dueAt ?? "").trim();
    const title =
      String(args.title ?? "").trim() || "Reunião comercial — Menve Sales";
    const durationMinutes = Number(args.durationMinutes) || 30;

    if (!email.includes("@")) {
      throw new BadRequestException("attendeeEmail inválido");
    }

    const userId =
      ctx.actorUserId ?? (await this.resolveCalendarUserId(ctx.tenantId));

    const conv = await this.getConversation(ctx);

    await this.calendar.createMeetingForTenant({
      tenantId: ctx.tenantId,
      userId,
      title,
      dueAt,
      durationMinutes,
      contactId: conv.contactId,
      createGoogleMeet: true,
    });

    await this.handoff.completeQualification({
      conversationId: ctx.conversationId,
      tenantId: ctx.tenantId,
      reason: "MEET_SCHEDULED",
      assignedUserId: userId,
    });

    return "Reunião agendada e lead promovido ao pipeline";
  }

  private async handoffHuman(
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<string> {
    const reason = String(args.reason ?? "HUMAN_REQUESTED").trim();
    await this.handoff.completeQualification({
      conversationId: ctx.conversationId,
      tenantId: ctx.tenantId,
      reason: "HUMAN_REQUESTED",
      assignedUserId: ctx.actorUserId,
    });
    return `Handoff registrado: ${reason}`;
  }

  private async updateNotes(
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<string> {
    const notes = String(args.notes ?? "").trim();
    if (!notes) throw new BadRequestException("notes obrigatório");

    const conv = await this.getConversation(ctx);
    const prev =
      (conv.contact.customData as Record<string, unknown> | null) ?? {};
    await this.prisma.contact.update({
      where: { id: conv.contactId },
      data: {
        customData: {
          ...prev,
          gabrielQualificationNotes: notes,
          gabrielQualificationUpdatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return "Notas salvas";
  }

  private async markOptOut(
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<string> {
    const conv = await this.getConversation(ctx);
    const phone = conv.contact.phone;
    if (phone) {
      await this.prisma.outreachCampaignRecipient.updateMany({
        where: {
          contactId: conv.contactId,
          status: { not: OutreachRecipientStatus.OPT_OUT },
        },
        data: { status: OutreachRecipientStatus.OPT_OUT },
      });
    }

    await this.handoff.completeQualification({
      conversationId: ctx.conversationId,
      tenantId: ctx.tenantId,
      reason: "OPT_OUT",
    });

    const farewell =
      String(args.message ?? "").trim() ||
      "Entendido! Você não receberá mais mensagens. Obrigado pelo retorno.";

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: "gabriel" },
    });

    if (phone) {
      await this.aiOutbound.sendText({
        tenantId: ctx.tenantId,
        connectionId: conv.whatsappConnectionId,
        toPhone: phone,
        text: farewell,
        conversationId: ctx.conversationId,
        contactId: conv.contactId,
        aiAgentId: agent?.id ?? null,
        agentRunId: ctx.agentRunId,
      });
    }

    return "Opt-out registrado";
  }
}
