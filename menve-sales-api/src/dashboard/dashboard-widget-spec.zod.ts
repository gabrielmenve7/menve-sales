import { DealStatus } from "@prisma/client";
import { z } from "zod";

const dealStatusEnum = z.enum(["OPEN", "WON", "LOST", "ARCHIVED"]);

const filterCustomFieldRow = z.object({
  key: z.string().min(1).max(64),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const widgetFilterRowSchema = z.object({
  rowJoin: z.enum(["AND", "OR"]).optional(),
  field: z.enum(["status", "tags", "createdAt", "customField"]),
  op: z.enum(["IS", "OR"]).optional(),
  statusCodes: z.array(dealStatusEnum).max(4).optional(),
  tagIds: z.array(z.string()).max(32).optional(),
  filterTagMatch: z.enum(["ALL", "ANY"]).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customKey: z.string().min(1).max(64).optional(),
  customValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  customDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const widgetFilterGroupSchema = z.object({
  groupJoin: z.enum(["AND", "OR"]).optional(),
  rows: z.array(widgetFilterRowSchema).min(1).max(16),
});

export type WidgetFilterRowInput = z.infer<typeof widgetFilterRowSchema>;
export type WidgetFilterGroupInput = z.infer<typeof widgetFilterGroupSchema>;

/** Entrada (API / JSON salvo) — aceita legado `measure` + `includeClosed` / `includeArchived`. */
export const widgetQuerySpecInputSchema = z.object({
  source: z.literal("DEALS"),
  pipelineId: z.string().min(1),
  dimension: z.enum(["BY_STAGE", "BY_STATUS", "BY_DAY"]).optional().nullable(),
  days: z.number().int().min(1).max(366).optional(),
  /** Com BY_DAY: primeiro dia da série (YYYY-MM-DD). Se definido, substitui janela rolante de `days`. */
  timelineStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Com BY_DAY + timelineStart: se true, inclui todos os dias até o fim do mês de timelineStart
   * (dias futuros com valor 0). Se false, a série vai só até hoje (comportamento anterior).
   */
  fillTimelineMonth: z.boolean().optional(),

  /** Legado */
  measure: z.enum(["COUNT", "SUM_VALUE"]).optional(),
  includeClosed: z.boolean().optional(),
  includeArchived: z.boolean().optional(),

  /** Novo: medida de negócio */
  dataMeasure: z.enum(["QUANTITY", "MONEY", "CUSTOM_NUMBER"]).optional(),
  /** Somatória ou média (vale para MONEY e CUSTOM_NUMBER) */
  aggregation: z.enum(["SUM", "AVG"]).optional(),
  /** Obrigatório quando dataMeasure = CUSTOM_NUMBER */
  customFieldKey: z.string().min(1).max(64).optional(),

  /** Filtros explícitos (se ausente, usa legado por status) */
  filterStatuses: z.array(dealStatusEnum).max(4).optional(),
  /** ALL = deal com todas as tags; ANY = deal com pelo menos uma (ou). */
  filterTagMatch: z.enum(["ALL", "ANY"]).optional(),
  filterTagIds: z.array(z.string()).max(32).optional(),
  filterCreatedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filterCreatedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filterCustomFields: z.array(filterCustomFieldRow).max(16).optional(),

  /** Grupos com E/Ou entre linhas e entre grupos (substitui filtros planos quando preenchido). */
  filterGroups: z.array(widgetFilterGroupSchema).min(1).max(12).optional(),
});

export type WidgetQuerySpecInput = z.infer<typeof widgetQuerySpecInputSchema>;

/** Spec normalizado usado pelo motor de query. */
export type ResolvedWidgetQuerySpec = {
  source: "DEALS";
  pipelineId: string;
  dimension: "BY_STAGE" | "BY_STATUS" | "BY_DAY" | null;
  days?: number;
  timelineStart?: string;
  fillTimelineMonth?: boolean;
  dataMeasure: "QUANTITY" | "MONEY" | "CUSTOM_NUMBER";
  aggregation: "SUM" | "AVG";
  customFieldKey?: string;
  filterStatuses: DealStatus[];
  filterTagMatch?: "ALL" | "ANY";
  filterTagIds?: string[];
  filterCreatedFrom?: string;
  filterCreatedTo?: string;
  filterCustomFields?: { key: string; value: string | number | boolean }[];
  includeClosed?: boolean;
  includeArchived?: boolean;
  /** Quando definido, `buildWhere` usa só isto (ignora filtros planos). */
  filterGroups?: WidgetFilterGroupInput[];
};

function resolveStatuses(input: WidgetQuerySpecInput): DealStatus[] {
  if (input.filterStatuses && input.filterStatuses.length > 0) {
    return input.filterStatuses as DealStatus[];
  }
  const set = new Set<DealStatus>([DealStatus.OPEN]);
  if (input.includeClosed) {
    set.add(DealStatus.WON);
    set.add(DealStatus.LOST);
  }
  if (input.includeArchived) {
    set.add(DealStatus.ARCHIVED);
  }
  return [...set];
}

export function resolveWidgetQuerySpec(
  input: WidgetQuerySpecInput,
): ResolvedWidgetQuerySpec {
  let dataMeasure = input.dataMeasure;
  let aggregation: "SUM" | "AVG" = input.aggregation ?? "SUM";

  if (!dataMeasure && input.measure === "COUNT") {
    dataMeasure = "QUANTITY";
  }
  if (!dataMeasure && input.measure === "SUM_VALUE") {
    dataMeasure = "MONEY";
    aggregation = "SUM";
  }
  if (!dataMeasure) {
    dataMeasure = "QUANTITY";
  }
  if (dataMeasure === "QUANTITY") {
    aggregation = "SUM";
  }

  const filterStatuses = resolveStatuses(input);

  const filterGroups =
    input.filterGroups && input.filterGroups.length > 0
      ? input.filterGroups
      : undefined;

  return {
    source: "DEALS",
    pipelineId: input.pipelineId,
    dimension: input.dimension ?? null,
    days: input.days,
    timelineStart: input.timelineStart?.trim() || undefined,
    fillTimelineMonth: input.fillTimelineMonth === true ? true : undefined,
    dataMeasure,
    aggregation,
    customFieldKey: input.customFieldKey,
    filterStatuses,
    filterTagMatch: filterGroups ? undefined : input.filterTagMatch,
    filterTagIds: filterGroups ? undefined : input.filterTagIds,
    filterCreatedFrom: filterGroups ? undefined : input.filterCreatedFrom,
    filterCreatedTo: filterGroups ? undefined : input.filterCreatedTo,
    filterCustomFields: filterGroups ? undefined : input.filterCustomFields,
    includeClosed: input.includeClosed,
    includeArchived: input.includeArchived,
    filterGroups,
  };
}

export const widgetQuerySpecSchema = widgetQuerySpecInputSchema.superRefine(
  (val, ctx) => {
    const dm = val.dataMeasure;
    const leg = val.measure;
    const effective =
      dm ??
      (leg === "COUNT" ? "QUANTITY" : leg === "SUM_VALUE" ? "MONEY" : undefined);
    if (effective === "CUSTOM_NUMBER" && !val.customFieldKey?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customFieldKey é obrigatório para medida Número (campo customizado)",
        path: ["customFieldKey"],
      });
    }
  },
);

export type WidgetQuerySpec = z.infer<typeof widgetQuerySpecSchema>;

export const widgetQueryBulkSchema = z.object({
  specs: z.array(widgetQuerySpecSchema).max(48),
});
