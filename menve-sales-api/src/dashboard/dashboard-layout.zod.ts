import { z } from "zod";
import { widgetQuerySpecSchema } from "./dashboard-widget-spec.zod";

const gridSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(24),
});

export const layoutWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["METRIC", "BAR", "PIE", "DONUT"]),
  title: z.string().max(120).optional(),
  grid: gridSchema,
  querySpec: widgetQuerySpecSchema,
});

export const layoutJsonSchema = z.object({
  schemaVersion: z.literal(1),
  widgets: z.array(layoutWidgetSchema).max(48),
});

export type LayoutJson = z.infer<typeof layoutJsonSchema>;
export type LayoutWidget = z.infer<typeof layoutWidgetSchema>;

export const EMPTY_LAYOUT: LayoutJson = {
  schemaVersion: 1,
  widgets: [],
};
