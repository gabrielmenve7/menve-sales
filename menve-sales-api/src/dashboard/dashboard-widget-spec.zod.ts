import { z } from "zod";

export const widgetQuerySpecSchema = z.object({
  source: z.literal("DEALS"),
  measure: z.enum(["COUNT", "SUM_VALUE"]),
  dimension: z.enum(["BY_STAGE", "BY_STATUS", "BY_DAY"]).optional().nullable(),
  pipelineId: z.string().min(1),
  includeClosed: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  days: z.number().int().min(1).max(366).optional(),
});

export type WidgetQuerySpec = z.infer<typeof widgetQuerySpecSchema>;

export const widgetQueryBulkSchema = z.object({
  specs: z.array(widgetQuerySpecSchema).max(48),
});
