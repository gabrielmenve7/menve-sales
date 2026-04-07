import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import {
  PipelineAutomationRunStatus,
  PipelineAutomationTriggerType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { DealsService } from "../deals/deals.service";
import { PrismaService } from "../prisma/prisma.service";
import { PIPELINE_AUTOMATION_MAX_DEPTH } from "./pipeline-automation.constants";
import {
  automationActionsSchema,
  parseCompositeTriggerFilter,
} from "./pipeline-automation.dto";

type StageEventCtx = {
  tenantId: string;
  actorUserId: string;
  dealId: string;
  pipelineId: string;
  fromStageId: string;
  toStageId: string;
  depth: number;
};

type SimpleDealCtx = {
  tenantId: string;
  actorUserId: string;
  dealId: string;
  pipelineId: string;
  depth: number;
};

type CreatedDealCtx = SimpleDealCtx & {
  campaignSourceId: string | null;
};

type AutomationEvent =
  | { kind: "created"; campaignSourceId: string | null }
  | { kind: "stage"; fromStageId: string; toStageId: string }
  | { kind: "won" }
  | { kind: "lost" }
  | { kind: "custom_field"; fieldKey: string; fromValue: unknown; toValue: unknown }
  | { kind: "assignee"; assigned: boolean }
  | { kind: "contact_tag"; tagId: string; added: boolean };

type TriggerFilterShape = {
  toStageId?: string;
  fromStageId?: string;
  campaignSourceIds?: string[];
  customFieldKey?: string;
  fromCustomValue?: unknown;
  toCustomValue?: unknown;
  tagId?: string;
};

function asTriggerFilter(filter: Prisma.JsonValue | null): TriggerFilterShape {
  return (filter ?? {}) as TriggerFilterShape;
}

function automationFilterValueMatches(
  expected: unknown | undefined,
  actual: unknown,
): boolean {
  if (expected === undefined) return true;
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function todayUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUtcIsoDate(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map((x) => parseInt(x, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

@Injectable()
export class PipelineAutomationEngineService {
  private readonly log = new Logger(PipelineAutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DealsService))
    private readonly dealsService: DealsService,
  ) {}

  private resolveSetDealCustomFieldPayload(action: {
    type: "SET_DEAL_CUSTOM_FIELD";
    fieldKey: string;
    datePreset?:
      | "DAYS_AFTER_TRIGGER"
      | "ON_TRIGGER_DATE"
      | "ON_TRIGGER_DATETIME"
      | "TRIGGER_FIELDS"
      | "PICK_DATE"
      | "REMOVE_DATE";
    daysAfter?: number;
    pickDate?: string;
    staticValue?: unknown;
  }): unknown {
    if (action.staticValue !== undefined) {
      return action.staticValue;
    }
    const p = action.datePreset;
    if (!p) {
      throw new Error("SET_DEAL_CUSTOM_FIELD sem valor");
    }
    if (p === "REMOVE_DATE") {
      return null;
    }
    if (p === "ON_TRIGGER_DATE" || p === "TRIGGER_FIELDS") {
      return todayUtcIsoDate();
    }
    if (p === "ON_TRIGGER_DATETIME") {
      return new Date().toISOString();
    }
    if (p === "DAYS_AFTER_TRIGGER") {
      const n = action.daysAfter ?? 0;
      return addDaysUtcIsoDate(todayUtcIsoDate(), n);
    }
    if (p === "PICK_DATE") {
      const s = (action.pickDate ?? "").trim();
      if (!s) throw new Error("pickDate vazio");
      return s;
    }
    throw new Error(`Preset de data não suportado: ${String(p)}`);
  }

  private async loadEnabledRules(tenantId: string, pipelineId: string) {
    return this.prisma.pipelineAutomationRule.findMany({
      where: { tenantId, pipelineId, enabled: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  private filterMatches(
    triggerType: PipelineAutomationTriggerType,
    filter: Prisma.JsonValue | null,
    event: AutomationEvent,
  ): boolean {
    const f = asTriggerFilter(filter);
    switch (triggerType) {
      case PipelineAutomationTriggerType.DEAL_CREATED:
        if (event.kind !== "created") return false;
        if (f.campaignSourceIds && f.campaignSourceIds.length > 0) {
          const c = event.campaignSourceId;
          if (!c || !f.campaignSourceIds.includes(c)) return false;
        }
        return true;
      case PipelineAutomationTriggerType.DEAL_ENTERED_STAGE:
        if (event.kind !== "stage") return false;
        if (f.toStageId && f.toStageId !== event.toStageId) return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_LEFT_STAGE:
        if (event.kind !== "stage") return false;
        if (f.fromStageId && f.fromStageId !== event.fromStageId) return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_STAGE_TRANSITION:
        if (event.kind !== "stage") return false;
        if (f.fromStageId && f.fromStageId !== event.fromStageId) return false;
        if (f.toStageId && f.toStageId !== event.toStageId) return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_CUSTOM_FIELD_CHANGED:
        if (event.kind !== "custom_field") return false;
        if (!f.customFieldKey || f.customFieldKey !== event.fieldKey)
          return false;
        if (
          !automationFilterValueMatches(f.fromCustomValue, event.fromValue)
        )
          return false;
        if (!automationFilterValueMatches(f.toCustomValue, event.toValue))
          return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_ASSIGNEE_ASSIGNED:
        return event.kind === "assignee" && event.assigned;
      case PipelineAutomationTriggerType.DEAL_ASSIGNEE_REMOVED:
        return event.kind === "assignee" && !event.assigned;
      case PipelineAutomationTriggerType.CONTACT_TAG_ADDED:
        if (event.kind !== "contact_tag" || !event.added) return false;
        if (f.tagId && f.tagId !== event.tagId) return false;
        return true;
      case PipelineAutomationTriggerType.CONTACT_TAG_REMOVED:
        if (event.kind !== "contact_tag" || event.added) return false;
        if (f.tagId && f.tagId !== event.tagId) return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_MARKED_WON:
        return event.kind === "won";
      case PipelineAutomationTriggerType.DEAL_MARKED_LOST:
        return event.kind === "lost";
      default:
        return false;
    }
  }

  private async tryCompositeRule(
    rule: {
      id: string;
      tenantId: string;
      pipelineId: string;
      triggerFilter: Prisma.JsonValue | null;
      actions: Prisma.JsonValue;
    },
    event: AutomationEvent,
    dealId: string,
    actorUserId: string,
    depth: number,
  ): Promise<void> {
    const comp = parseCompositeTriggerFilter(rule.triggerFilter);
    if (!comp || comp.clauses.length < 2) return;

    const n = comp.clauses.length;
    const fullMask = (1 << n) - 1;
    const matchedIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = comp.clauses[i];
      if (
        this.filterMatches(
          c.triggerType,
          c.triggerFilter as Prisma.JsonValue,
          event,
        )
      ) {
        matchedIndices.push(i);
      }
    }
    if (matchedIndices.length === 0) return;

    if (comp.op === "OR") {
      const mt = comp.clauses[matchedIndices[0]].triggerType;
      await this.executeRule(rule, dealId, actorUserId, mt, depth);
      return;
    }

    const existing =
      await this.prisma.pipelineAutomationAndProgress.findUnique({
        where: {
          ruleId_dealId: { ruleId: rule.id, dealId },
        },
      });
    let mask = existing?.mask ?? 0;
    for (const i of matchedIndices) {
      mask |= 1 << i;
    }
    if (mask === fullMask) {
      await this.executeRule(
        rule,
        dealId,
        actorUserId,
        comp.clauses[0].triggerType,
        depth,
      );
      mask = 0;
    }
    await this.prisma.pipelineAutomationAndProgress.upsert({
      where: {
        ruleId_dealId: { ruleId: rule.id, dealId },
      },
      create: {
        tenantId: rule.tenantId,
        ruleId: rule.id,
        dealId,
        mask,
      },
      update: { mask },
    });
  }

  private async recordRun(
    tenantId: string,
    ruleId: string,
    dealId: string,
    triggerType: PipelineAutomationTriggerType,
    status: PipelineAutomationRunStatus,
    errorMessage?: string,
    executedActions?: Prisma.InputJsonValue,
  ) {
    await this.prisma.pipelineAutomationRun.create({
      data: {
        tenantId,
        ruleId,
        dealId,
        triggerType,
        status,
        errorMessage: errorMessage ?? null,
        executedActions: executedActions ?? undefined,
      },
    });
  }

  private triggersRequiringOpenDeal(
    t: PipelineAutomationTriggerType,
  ): boolean {
    return (
      t === PipelineAutomationTriggerType.DEAL_CREATED ||
      t === PipelineAutomationTriggerType.DEAL_ENTERED_STAGE ||
      t === PipelineAutomationTriggerType.DEAL_LEFT_STAGE ||
      t === PipelineAutomationTriggerType.DEAL_STAGE_TRANSITION ||
      t === PipelineAutomationTriggerType.DEAL_CUSTOM_FIELD_CHANGED ||
      t === PipelineAutomationTriggerType.DEAL_ASSIGNEE_ASSIGNED ||
      t === PipelineAutomationTriggerType.DEAL_ASSIGNEE_REMOVED ||
      t === PipelineAutomationTriggerType.CONTACT_TAG_ADDED ||
      t === PipelineAutomationTriggerType.CONTACT_TAG_REMOVED
    );
  }

  /** Só usa id/tenantId/pipelineId/actions; gatilho efetivo vem em matchedTriggerType (ex.: regras COMPOSITE). */
  private async executeRule(
    rule: {
      id: string;
      tenantId: string;
      pipelineId: string;
      actions: Prisma.JsonValue;
    },
    dealId: string,
    actorUserId: string,
    matchedTriggerType: PipelineAutomationTriggerType,
    depth: number,
  ): Promise<void> {
    const parsed = automationActionsSchema.safeParse(rule.actions);
    if (!parsed.success) {
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.FAILED,
        "Ações da regra inválidas",
      );
      return;
    }

    const deal = await this.prisma.deal.findFirst({
      where: {
        id: dealId,
        tenantId: rule.tenantId,
        pipelineId: rule.pipelineId,
      },
      select: { id: true, stageId: true, status: true },
    });
    if (!deal) {
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.FAILED,
        "Oportunidade não encontrada",
      );
      return;
    }

    const requireOpen = this.triggersRequiringOpenDeal(matchedTriggerType);

    if (requireOpen && deal.status !== "OPEN") {
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.SKIPPED,
        undefined,
        { reason: "deal_not_open" } as unknown as Prisma.InputJsonValue,
      );
      return;
    }

    let currentStageId = deal.stageId;
    const executed: Record<string, unknown>[] = [];
    try {
      for (const action of parsed.data) {
        if (action.type === "MOVE_TO_STAGE") {
          if (currentStageId === action.stageId) {
            executed.push({
              type: action.type,
              stageId: action.stageId,
              result: "already_on_stage",
            });
            continue;
          }
          await this.dealsService.moveStage(
            rule.tenantId,
            actorUserId,
            dealId,
            action.stageId,
            { automationDepth: depth + 1 },
          );
          executed.push({
            type: action.type,
            stageId: action.stageId,
            result: "moved",
          });
          const refreshed = await this.prisma.deal.findFirst({
            where: { id: dealId, tenantId: rule.tenantId },
            select: { stageId: true },
          });
          if (refreshed) currentStageId = refreshed.stageId;
        } else if (action.type === "SET_DEAL_CUSTOM_FIELD") {
          const payload = this.resolveSetDealCustomFieldPayload(action);
          await this.dealsService.updateCustomData(
            rule.tenantId,
            actorUserId,
            dealId,
            { [action.fieldKey]: payload },
            { automationDepth: depth },
          );
          executed.push({
            type: action.type,
            fieldKey: action.fieldKey,
            result: "set",
          });
        }
      }

      const allNoOp = executed.every((e) => e.result === "already_on_stage");
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        allNoOp && executed.length > 0
          ? PipelineAutomationRunStatus.SKIPPED
          : PipelineAutomationRunStatus.SUCCESS,
        undefined,
        executed as unknown as Prisma.InputJsonValue,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`Automation rule ${rule.id} failed: ${msg}`);
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.FAILED,
        msg,
        executed as unknown as Prisma.InputJsonValue,
      );
    }
  }

  async afterDealCreated(ctx: CreatedDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = {
      kind: "created",
      campaignSourceId: ctx.campaignSourceId,
    };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (rule.triggerType !== PipelineAutomationTriggerType.DEAL_CREATED)
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_CREATED,
        ctx.depth,
      );
    }
  }

  async afterDealStageChanged(ctx: StageEventCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = {
      kind: "stage",
      fromStageId: ctx.fromStageId,
      toStageId: ctx.toStageId,
    };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (
        rule.triggerType !==
          PipelineAutomationTriggerType.DEAL_ENTERED_STAGE &&
        rule.triggerType !== PipelineAutomationTriggerType.DEAL_LEFT_STAGE &&
        rule.triggerType !==
          PipelineAutomationTriggerType.DEAL_STAGE_TRANSITION
      ) {
        continue;
      }
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        rule.triggerType,
        ctx.depth,
      );
    }
  }

  async afterDealCustomFieldChanged(ctx: {
    tenantId: string;
    actorUserId: string;
    dealId: string;
    pipelineId: string;
    fieldKey: string;
    fromValue: unknown;
    toValue: unknown;
    depth: number;
  }): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = {
      kind: "custom_field",
      fieldKey: ctx.fieldKey,
      fromValue: ctx.fromValue,
      toValue: ctx.toValue,
    };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (
        rule.triggerType !==
          PipelineAutomationTriggerType.DEAL_CUSTOM_FIELD_CHANGED
      )
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_CUSTOM_FIELD_CHANGED,
        ctx.depth,
      );
    }
  }

  async afterDealAssigneeAssigned(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = { kind: "assignee", assigned: true };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (
        rule.triggerType !==
          PipelineAutomationTriggerType.DEAL_ASSIGNEE_ASSIGNED
      )
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_ASSIGNEE_ASSIGNED,
        ctx.depth,
      );
    }
  }

  async afterDealAssigneeRemoved(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = { kind: "assignee", assigned: false };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (
        rule.triggerType !==
          PipelineAutomationTriggerType.DEAL_ASSIGNEE_REMOVED
      )
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_ASSIGNEE_REMOVED,
        ctx.depth,
      );
    }
  }

  async afterContactTagAdded(ctx: {
    tenantId: string;
    actorUserId: string;
    contactId: string;
    tagId: string;
    depth: number;
  }): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const deals = await this.prisma.deal.findMany({
      where: {
        tenantId: ctx.tenantId,
        contactId: ctx.contactId,
        status: "OPEN",
      },
      select: { id: true, pipelineId: true },
    });
    const event: AutomationEvent = {
      kind: "contact_tag",
      tagId: ctx.tagId,
      added: true,
    };
    for (const d of deals) {
      const rules = await this.loadEnabledRules(ctx.tenantId, d.pipelineId);
      for (const rule of rules) {
        if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
          await this.tryCompositeRule(
            rule,
            event,
            d.id,
            ctx.actorUserId,
            ctx.depth,
          );
          continue;
        }
        if (
          rule.triggerType !==
            PipelineAutomationTriggerType.CONTACT_TAG_ADDED
        )
          continue;
        if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
          continue;
        await this.executeRule(
          rule,
          d.id,
          ctx.actorUserId,
          PipelineAutomationTriggerType.CONTACT_TAG_ADDED,
          ctx.depth,
        );
      }
    }
  }

  async afterContactTagRemoved(ctx: {
    tenantId: string;
    actorUserId: string;
    contactId: string;
    tagId: string;
    depth: number;
  }): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const deals = await this.prisma.deal.findMany({
      where: {
        tenantId: ctx.tenantId,
        contactId: ctx.contactId,
        status: "OPEN",
      },
      select: { id: true, pipelineId: true },
    });
    const event: AutomationEvent = {
      kind: "contact_tag",
      tagId: ctx.tagId,
      added: false,
    };
    for (const d of deals) {
      const rules = await this.loadEnabledRules(ctx.tenantId, d.pipelineId);
      for (const rule of rules) {
        if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
          await this.tryCompositeRule(
            rule,
            event,
            d.id,
            ctx.actorUserId,
            ctx.depth,
          );
          continue;
        }
        if (
          rule.triggerType !==
            PipelineAutomationTriggerType.CONTACT_TAG_REMOVED
        )
          continue;
        if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
          continue;
        await this.executeRule(
          rule,
          d.id,
          ctx.actorUserId,
          PipelineAutomationTriggerType.CONTACT_TAG_REMOVED,
          ctx.depth,
        );
      }
    }
  }

  async afterDealMarkedWon(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = { kind: "won" };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (rule.triggerType !== PipelineAutomationTriggerType.DEAL_MARKED_WON)
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_MARKED_WON,
        ctx.depth,
      );
    }
  }

  async afterDealMarkedLost(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event: AutomationEvent = { kind: "lost" };
    for (const rule of rules) {
      if (rule.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
        await this.tryCompositeRule(
          rule,
          event,
          ctx.dealId,
          ctx.actorUserId,
          ctx.depth,
        );
        continue;
      }
      if (rule.triggerType !== PipelineAutomationTriggerType.DEAL_MARKED_LOST)
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_MARKED_LOST,
        ctx.depth,
      );
    }
  }
}
