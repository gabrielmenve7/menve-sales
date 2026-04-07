import { PipelineAutomationTriggerType } from "@prisma/client";
import { z } from "zod";

export const triggerFilterSchema = z
  .object({
    toStageId: z.string().optional(),
    fromStageId: z.string().optional(),
    /** Se definido e não vazio, só dispara para essas origens de campanha. */
    campaignSourceIds: z.array(z.string().min(1)).optional(),
    customFieldKey: z.string().min(1).optional(),
    fromCustomValue: z.unknown().optional(),
    toCustomValue: z.unknown().optional(),
    tagId: z.string().min(1).optional(),
  })
  .strict()
  .optional()
  .nullable();

const actionMoveToStageSchema = z.object({
  type: z.literal("MOVE_TO_STAGE"),
  stageId: z.string().min(1),
});

export const automationActionsSchema = z
  .array(actionMoveToStageSchema)
  .min(1)
  .max(5);

export const createPipelineAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  triggerType: z.nativeEnum(PipelineAutomationTriggerType),
  triggerFilter: triggerFilterSchema,
  actions: automationActionsSchema,
});

export const updatePipelineAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  triggerType: z.nativeEnum(PipelineAutomationTriggerType).optional(),
  triggerFilter: triggerFilterSchema,
  actions: automationActionsSchema.optional(),
});

export type CreatePipelineAutomationRuleInput = z.infer<
  typeof createPipelineAutomationRuleSchema
>;
export type UpdatePipelineAutomationRuleInput = z.infer<
  typeof updatePipelineAutomationRuleSchema
>;
