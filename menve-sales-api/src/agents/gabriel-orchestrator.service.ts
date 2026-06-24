import { Injectable, Logger } from "@nestjs/common";
import {
  AgentRunStatus,
  ConversationQualificationMode,
} from "@prisma/client";
import { resolveJourneyContext } from "../deals/journey-context.util";
import { PrismaService } from "../prisma/prisma.service";
import { GabrielEligibilityService } from "./gabriel-eligibility.service";
import { AudioTranscriptionService } from "./audio-transcription.service";
import { isInboundAudioMessage } from "./inbound-audio.util";
import { OpenAiLlmProvider } from "./llm/openai.provider";
import type { LlmMessage } from "./llm/llm-provider.interface";
import {
  buildChatHistory,
  buildGabrielSystemPrompt,
} from "./prompt-builder";
import { GABRIEL_TOOLS } from "./tools/gabriel-tools.definitions";
import { GabrielToolsService } from "./tools/gabriel-tools.service";
import type { ToolContext } from "./tools/tool-types";

const GABRIEL_KEY = "gabriel";
const MAX_HISTORY = Number(process.env.GABRIEL_MAX_HISTORY_MESSAGES) || 30;
const MAX_TOOL_ROUNDS = 5;

@Injectable()
export class GabrielOrchestratorService {
  private readonly log = new Logger(GabrielOrchestratorService.name);
  private readonly llm = new OpenAiLlmProvider();
  private readonly pendingTurns = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: GabrielEligibilityService,
    private readonly tools: GabrielToolsService,
    private readonly transcription: AudioTranscriptionService,
  ) {}

  /** Ativo Gabriel manualmente em conversa com resposta a disparo. */
  async activateOnConversation(args: {
    tenantId: string;
    conversationId: string;
    contactId: string;
    outreachRecipientId: string;
  }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: { gabrielEnabled: true },
    });
    if (!tenant?.gabrielEnabled) {
      throw new Error("Gabriel desativado neste workspace");
    }

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: GABRIEL_KEY },
    });
    if (!agent?.isActive) {
      throw new Error("Agente Gabriel inativo");
    }

    await this.prisma.conversation.update({
      where: { id: args.conversationId },
      data: {
        qualificationMode: ConversationQualificationMode.AI_ACTIVE,
        aiAgentId: agent.id,
        outreachRecipientId: args.outreachRecipientId,
      },
    });

    await this.enqueueTurn({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      contactId: args.contactId,
    });
  }

  async activateOnInboundReply(args: {
    tenantId: string;
    conversationId: string;
    contactId: string;
    outreachRecipientId?: string | null;
    triggerMessageId?: string;
    isAudio?: boolean;
    mediaReady?: boolean;
  }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: { gabrielEnabled: true },
    });
    if (!tenant?.gabrielEnabled) return;

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: GABRIEL_KEY },
    });
    if (!agent?.isActive) return;

    await this.prisma.conversation.update({
      where: { id: args.conversationId },
      data: {
        qualificationMode: ConversationQualificationMode.AI_ACTIVE,
        aiAgentId: agent.id,
        outreachRecipientId: args.outreachRecipientId ?? undefined,
      },
    });

    await this.enqueueTurn({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      triggerMessageId: args.triggerMessageId,
      waitForAudioMs:
        args.isAudio && args.mediaReady === false ? 12_000 : 0,
    });
  }

  /** Reage a nova mensagem inbound com Gabriel já ativo. */
  notifyInboundMessage(args: {
    tenantId: string;
    conversationId: string;
    contactId: string;
    messageId: string;
    isAudio: boolean;
    mediaReady: boolean;
  }) {
    void this.enqueueTurn({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      triggerMessageId: args.messageId,
      waitForAudioMs: args.isAudio && !args.mediaReady ? 12_000 : 0,
    });
  }

  enqueueTurn(args: {
    tenantId: string;
    conversationId: string;
    contactId: string;
    triggerMessageId?: string;
    waitForAudioMs?: number;
  }) {
    const key = args.conversationId;
    const existing = this.pendingTurns.get(key);
    if (existing) clearTimeout(existing);

    void this.prisma.tenant
      .findUnique({
        where: { id: args.tenantId },
        select: { gabrielReplyDelayMs: true },
      })
      .then((tenant) => {
        const baseDelay = tenant?.gabrielReplyDelayMs ?? 1500;
        const delay = baseDelay + Math.max(0, args.waitForAudioMs ?? 0);
        const timer = setTimeout(() => {
          this.pendingTurns.delete(key);
          void this.runTurn(args).catch((e) => {
            this.log.error(
              `runTurn failed conversation=${args.conversationId}: ${e instanceof Error ? e.message : String(e)}`,
            );
          });
        }, delay);
        this.pendingTurns.set(key, timer);
      });
  }

  async runTurn(args: {
    tenantId: string;
    conversationId: string;
    contactId: string;
    triggerMessageId?: string;
    waitForAudioMs?: number;
  }) {
    const check = await this.eligibility.shouldRun({
      tenantId: args.tenantId,
      conversationId: args.conversationId,
    });
    if (!check.eligible) return;

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: GABRIEL_KEY },
    });
    if (!agent) return;

    const skills = await this.prisma.aiAgentSkill.findMany({
      where: { tenantId: args.tenantId, agentId: agent.id },
      orderBy: { sortOrder: "asc" },
    });
    if (!skills.length) {
      this.log.warn(`No skills for tenant ${args.tenantId}`);
      return;
    }

    const [tenant, journey, messagesRaw] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: args.tenantId },
        select: { name: true, gabrielModel: true },
      }),
      resolveJourneyContext(this.prisma, args.tenantId, args.contactId),
      this.prisma.message.findMany({
        where: { conversationId: args.conversationId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          body: true,
          senderType: true,
          mediaUrl: true,
          mediaType: true,
          audioTranscript: true,
        },
      }),
    ]);

    const messages = await this.ensureAudioTranscripts({
      messages: messagesRaw,
      triggerMessageId: args.triggerMessageId,
      waitForAudioMs: args.waitForAudioMs ?? 0,
    });

    const model =
      tenant?.gabrielModel?.trim() ||
      process.env.GABRIEL_DEFAULT_MODEL?.trim() ||
      "gpt-4o-mini";

    const agentRun = await this.prisma.agentRun.create({
      data: {
        tenantId: args.tenantId,
        conversationId: args.conversationId,
        agentId: agent.id,
        triggerMessageId: args.triggerMessageId ?? null,
        status: AgentRunStatus.RUNNING,
        skillVersionSnapshot: Object.fromEntries(
          skills.map((s) => [s.skillKey, s.version]),
        ),
      },
    });

    const toolCtx: ToolContext = {
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      agentRunId: agentRun.id,
      actorUserId: null,
    };

    const systemPrompt = buildGabrielSystemPrompt({
      skills,
      journey: {
        name: journey.name,
        company: journey.company,
        phone: journey.phone,
        website: journey.website,
      },
      tenantName: tenant?.name,
    });

    const history = buildChatHistory(messages, MAX_HISTORY);
    let llmMessages: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    const handlers = this.tools.handlers();
    const toolCallsLog: unknown[] = [];

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const completion = await this.llm.complete({
          model,
          messages: llmMessages,
          tools: GABRIEL_TOOLS,
        });

        if (completion.toolCalls.length === 0) {
          if (completion.content?.trim()) {
            await handlers.send_whatsapp_message(toolCtx, {
              text: completion.content.trim(),
            });
          }
          await this.prisma.agentRun.update({
            where: { id: agentRun.id },
            data: {
              status: AgentRunStatus.COMPLETED,
              promptTokens: completion.promptTokens,
              completionTokens: completion.completionTokens,
              toolCalls: toolCallsLog as object,
              finishedAt: new Date(),
            },
          });
          return;
        }

        llmMessages.push({
          role: "assistant",
          content: completion.content,
          tool_calls: completion.toolCalls,
        });

        for (const tc of completion.toolCalls) {
          const name = tc.function.name;
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(tc.function.arguments || "{}") as Record<
              string,
              unknown
            >;
          } catch {
            parsed = {};
          }

          const handler = handlers[name];
          let result: string;
          if (!handler) {
            result = `Tool desconhecida: ${name}`;
          } else {
            result = await handler(toolCtx, parsed);
          }
          toolCallsLog.push({ name, args: parsed, result });

          llmMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
      }

      await this.prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: AgentRunStatus.COMPLETED,
          toolCalls: toolCallsLog as object,
          finishedAt: new Date(),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: AgentRunStatus.FAILED,
          error: msg,
          finishedAt: new Date(),
        },
      });
      await this.prisma.conversation.update({
        where: { id: args.conversationId },
        data: {
          qualificationMode: ConversationQualificationMode.AI_PAUSED,
          aiPausedAt: new Date(),
          handoffReason: "AI_ERROR",
        },
      });
      throw e;
    }
  }

  private async ensureAudioTranscripts(args: {
    messages: {
      id: string;
      direction: string;
      body: string;
      senderType: string;
      mediaUrl: string | null;
      mediaType: string | null;
      audioTranscript: string | null;
    }[];
    triggerMessageId?: string;
    waitForAudioMs: number;
  }) {
    const deadline = Date.now() + args.waitForAudioMs;
    let rows = [...args.messages];

    while (true) {
      for (const m of rows) {
        if (m.direction !== "INBOUND" && m.senderType !== "LEAD") continue;
        if (!this.transcription.needsTranscription(m)) continue;

        const transcript = await this.transcription.transcribeMessage({
          mediaUrl: m.mediaUrl!,
          mediaType: m.mediaType,
        });
        if (transcript) {
          await this.prisma.message.update({
            where: { id: m.id },
            data: { audioTranscript: transcript },
          });
          m.audioTranscript = transcript;
          this.log.log(`audio transcribed message=${m.id} len=${transcript.length}`);
        }
      }

      const trigger = args.triggerMessageId
        ? rows.find((m) => m.id === args.triggerMessageId)
        : undefined;
      const triggerNeedsMedia =
        trigger &&
        isInboundAudioMessage(trigger) &&
        !trigger.audioTranscript?.trim() &&
        !trigger.mediaUrl?.trim();

      if (!triggerNeedsMedia || Date.now() >= deadline) {
        return rows;
      }

      await new Promise((r) => setTimeout(r, 2_000));
      const fresh = await this.prisma.message.findMany({
        where: {
          id: { in: rows.map((m) => m.id) },
        },
        select: {
          id: true,
          direction: true,
          body: true,
          senderType: true,
          mediaUrl: true,
          mediaType: true,
          audioTranscript: true,
        },
      });
      const byId = new Map(fresh.map((m) => [m.id, m]));
      rows = rows.map((m) => byId.get(m.id) ?? m);
    }
  }
}
