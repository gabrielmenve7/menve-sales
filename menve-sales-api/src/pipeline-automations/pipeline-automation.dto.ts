import { PipelineAutomationTriggerType } from "@prisma/client";
import { z } from "zod";

/** Filtro “plano” (sem aninhamento composto). */
export const legacyTriggerFilterObjectSchema = z
  .object({
    toStageId: z.string().optional(),
    fromStageId: z.string().optional(),
    campaignSourceIds: z.array(z.string().min(1)).optional(),
    customFieldKey: z.string().min(1).optional(),
    fromCustomValue: z.unknown().optional(),
    toCustomValue: z.unknown().optional(),
    tagId: z.string().min(1).optional(),
  })
  .strict();

export const compositeClauseSchema = z
  .object({
    triggerType: z.nativeEnum(PipelineAutomationTriggerType),
    triggerFilter: legacyTriggerFilterObjectSchema.optional().nullable(),
  })
  .strict()
  .refine(
    (c) => c.triggerType !== PipelineAutomationTriggerType.COMPOSITE,
    { message: "Gatilho composto não pode ser aninhado" },
  );

export const compositeTriggerFilterSchema = z
  .object({
    composite: z.object({
      op: z.enum(["AND", "OR"]),
      clauses: z.array(compositeClauseSchema).min(2).max(8),
    }),
  })
  .strict();

export type CompositeTriggerPayload = z.infer<typeof compositeTriggerFilterSchema>;

/** Valor de triggerFilter: legado, composto ou null. */
export const triggerFilterSchema = z.union([
  z.null(),
  compositeTriggerFilterSchema,
  legacyTriggerFilterObjectSchema,
]);

export function parseCompositeTriggerFilter(
  triggerFilter: unknown,
): CompositeTriggerPayload["composite"] | null {
  const r = compositeTriggerFilterSchema.safeParse(triggerFilter);
  return r.success ? r.data.composite : null;
}

const actionMoveToStageSchema = z.object({
  type: z.literal("MOVE_TO_STAGE"),
  stageId: z.string().min(1),
});

const automationDatePresetSchema = z.enum([
  "DAYS_AFTER_TRIGGER",
  "ON_TRIGGER_DATE",
  "ON_TRIGGER_DATETIME",
  "TRIGGER_FIELDS",
  "PICK_DATE",
  "REMOVE_DATE",
]);

const actionSetDealCustomFieldSchema = z.object({
  type: z.literal("SET_DEAL_CUSTOM_FIELD"),
  fieldKey: z.string().min(1),
  datePreset: automationDatePresetSchema.optional(),
  daysAfter: z.number().int().min(0).max(3650).optional(),
  pickDate: z.string().min(1).max(120).optional(),
  staticValue: z.unknown().optional(),
});

export const automationActionSchema = z.union([
  actionMoveToStageSchema,
  actionSetDealCustomFieldSchema,
]);

function assertSetDealCustomFieldActionValid(
  data: z.infer<typeof actionSetDealCustomFieldSchema>,
  pathPrefix: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  if (data.staticValue !== undefined && data.datePreset !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use datePreset ou staticValue, não ambos",
      path: [...pathPrefix, "staticValue"],
    });
  }
  if (data.staticValue === undefined && data.datePreset === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Defina datePreset ou staticValue",
      path: [...pathPrefix, "datePreset"],
    });
  }
  if (data.datePreset === "DAYS_AFTER_TRIGGER" && data.daysAfter === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "daysAfter obrigatório para DAYS_AFTER_TRIGGER",
      path: [...pathPrefix, "daysAfter"],
    });
  }
  if (
    data.datePreset === "PICK_DATE" &&
    (!data.pickDate || !String(data.pickDate).trim())
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "pickDate obrigatório para PICK_DATE",
      path: [...pathPrefix, "pickDate"],
    });
  }
}

/** Vazio = regra só dispara registro de execução (útil até haver mais tipos de ação na API). */
export const automationActionsSchema = z
  .array(automationActionSchema)
  .max(5)
  .superRefine((arr, ctx) => {
    arr.forEach((action, i) => {
      if (action.type === "SET_DEAL_CUSTOM_FIELD") {
        assertSetDealCustomFieldActionValid(action, [i], ctx);
      }
    });
  });

export const createPipelineAutomationRuleSchema = z
  .object({
    name: z.string().min(1).max(200),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    triggerType: z.nativeEnum(PipelineAutomationTriggerType),
    triggerFilter: triggerFilterSchema,
    actions: automationActionsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.triggerType === PipelineAutomationTriggerType.COMPOSITE) {
      const comp = parseCompositeTriggerFilter(data.triggerFilter);
      if (!comp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Gatilho composto requer filtro { composite: { op, clauses } }",
          path: ["triggerFilter"],
        });
      }
    } else if (
      data.triggerFilter !== null &&
      typeof data.triggerFilter === "object" &&
      data.triggerFilter !== null &&
      "composite" in data.triggerFilter
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use triggerType COMPOSITE para múltiplos gatilhos",
        path: ["triggerFilter"],
      });
    }
  });

export const updatePipelineAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  triggerType: z.nativeEnum(PipelineAutomationTriggerType).optional(),
  triggerFilter: triggerFilterSchema.optional(),
  actions: automationActionsSchema.optional(),
});

export type CreatePipelineAutomationRuleInput = z.infer<
  typeof createPipelineAutomationRuleSchema
>;
export type UpdatePipelineAutomationRuleInput = z.infer<
  typeof updatePipelineAutomationRuleSchema
>;
