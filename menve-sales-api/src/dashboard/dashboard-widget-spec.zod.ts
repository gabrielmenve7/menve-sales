import { DealStatus } from "@prisma/client";
import { z } from "zod";
import { countYmdRangeDaysInclusive } from "../common/calendar-brazil.util";
import { WIDGET_FILTER_ROLLING_DATE_PRESETS } from "./dashboard-custom-date-preset.util";

const dealStatusEnum = z.enum(["OPEN", "WON", "LOST", "ARCHIVED"]);

const filterCustomFieldRow = z.object({
  key: z.string().min(1).max(64),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const widgetFilterRowSchema = z.object({
  rowJoin: z.enum(["AND", "OR"]).optional(),
  field: z.enum(["status", "tags", "createdAt", "updatedAt", "customField"]),
  op: z.enum(["IS", "OR"]).optional(),
  statusCodes: z.array(dealStatusEnum).max(4).optional(),
  stageIds: z.array(z.string()).max(48).optional(),
  tagIds: z.array(z.string()).max(32).optional(),
  filterTagMatch: z.enum(["ALL", "ANY"]).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customKey: z.string().min(1).max(64).optional(),
  customValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  customDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Período relativo (Hoje, Este mês, …) para campo DATE; resolvido na hora da query. */
  customDatePreset: z
    .enum(
      WIDGET_FILTER_ROLLING_DATE_PRESETS as unknown as [
        string,
        ...string[],
      ],
    )
    .optional(),
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
  dimension: z
    .enum([
      "BY_STAGE",
      "BY_STATUS",
      "BY_DAY",
      "BY_ASSIGNEE",
      "BY_CUSTOM_VALUE",
      "BY_GOAL_PROGRESS",
      "BY_PRODUCT_SOLD",
      "BY_ASSIGNEE_RANKED_SALES",
    ])
    .optional()
    .nullable(),
  /**
   * Com BY_CUSTOM_VALUE: chave do campo em `customData` usada para fatiar as barras.
   * Não usar com campos DATE (use BY_DAY + timelineBucketFieldKey).
   */
  groupByCustomFieldKey: z.string().min(1).max(64).optional(),
  days: z.number().int().min(1).max(366).optional(),
  /** Com BY_DAY: primeiro dia da série (YYYY-MM-DD). Se definido, substitui janela rolante de `days`. */
  timelineStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Com BY_DAY + timelineStart: se true, inclui todos os dias até o fim do mês de timelineStart
   * (dias futuros com valor 0). Se false, a série vai só até hoje (comportamento anterior).
   */
  fillTimelineMonth: z.boolean().optional(),
  /**
   * Com BY_DAY + timelineStart: fim fixo da série (YYYY-MM-DD), inclusive.
   * Quando definido, o eixo lista todos os dias entre `timelineStart` e `timelineEnd`
   * (útil para intervalo personalizado). Ignora o recorte “até o fim do mês” de `fillTimelineMonth`.
   */
  timelineEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Com BY_DAY: agrupar por esta chave de campo DATE em `customData` (YYYY-MM-DD ou ISO).
   * Se omitido, mantém o comportamento anterior (bucket pela data de criação do deal).
   */
  timelineBucketFieldKey: z.string().min(1).max(64).optional(),
  /**
   * Com BY_DAY sem campo custom de data: qual data do deal define o bucket do eixo.
   * `UPDATED_AT` aproxima o dia do fechamento para ganhos (WON).
   */
  byDayAnchor: z.enum(["CREATED_AT", "UPDATED_AT"]).optional(),
  /** Com BY_GOAL_PROGRESS: meta em R$ (série = realizado vs falta). */
  gaugeTargetMoney: z.number().finite().min(0).optional(),
  /** Com BY_PRODUCT_SOLD / BY_ASSIGNEE_RANKED_SALES: quantidade de linhas no ranking. */
  rankingLimit: z.number().int().min(3).max(30).optional(),

  /** Legado */
  measure: z.enum(["COUNT", "SUM_VALUE"]).optional(),
  includeClosed: z.boolean().optional(),
  includeArchived: z.boolean().optional(),

  /** Novo: medida de negócio */
  dataMeasure: z
    .enum(["QUANTITY", "MONEY", "CUSTOM_NUMBER", "AVG_CYCLE_DAYS"])
    .optional(),
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
  filterUpdatedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filterUpdatedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filterCustomFields: z.array(filterCustomFieldRow).max(16).optional(),

  /** Grupos com E/Ou entre linhas e entre grupos (substitui filtros planos quando preenchido). */
  filterGroups: z.array(widgetFilterGroupSchema).min(1).max(12).optional(),
});

export type WidgetQuerySpecInput = z.infer<typeof widgetQuerySpecInputSchema>;

/** Spec normalizado usado pelo motor de query. */
export type ResolvedWidgetQuerySpec = {
  source: "DEALS";
  pipelineId: string;
  dimension:
    | "BY_STAGE"
    | "BY_STATUS"
    | "BY_DAY"
    | "BY_ASSIGNEE"
    | "BY_CUSTOM_VALUE"
    | "BY_GOAL_PROGRESS"
    | "BY_PRODUCT_SOLD"
    | "BY_ASSIGNEE_RANKED_SALES"
    | null;
  days?: number;
  timelineStart?: string;
  timelineEnd?: string;
  fillTimelineMonth?: boolean;
  timelineBucketFieldKey?: string;
  byDayAnchor?: "CREATED_AT" | "UPDATED_AT";
  gaugeTargetMoney?: number;
  rankingLimit?: number;
  /** Só com dimension = BY_CUSTOM_VALUE */
  groupByCustomFieldKey?: string;
  dataMeasure: "QUANTITY" | "MONEY" | "CUSTOM_NUMBER" | "AVG_CYCLE_DAYS";
  aggregation: "SUM" | "AVG";
  customFieldKey?: string;
  filterStatuses: DealStatus[];
  filterTagMatch?: "ALL" | "ANY";
  filterTagIds?: string[];
  filterCreatedFrom?: string;
  filterCreatedTo?: string;
  filterUpdatedFrom?: string;
  filterUpdatedTo?: string;
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
  if (dataMeasure === "QUANTITY" || dataMeasure === "AVG_CYCLE_DAYS") {
    aggregation = "SUM";
  }

  const filterStatuses = resolveStatuses(input);

  const filterGroups =
    input.filterGroups && input.filterGroups.length > 0
      ? input.filterGroups
      : undefined;

  const dim = input.dimension ?? null;
  if (dim === "BY_GOAL_PROGRESS") {
    dataMeasure = "MONEY";
    aggregation = "SUM";
  }
  if (dim === "BY_PRODUCT_SOLD" || dim === "BY_ASSIGNEE_RANKED_SALES") {
    dataMeasure = "QUANTITY";
    aggregation = "SUM";
  }
  const timelineBucketTrim = input.timelineBucketFieldKey?.trim();
  const groupByTrim = input.groupByCustomFieldKey?.trim();

  return {
    source: "DEALS",
    pipelineId: input.pipelineId,
    dimension: dim,
    days: input.days,
    timelineStart: input.timelineStart?.trim() || undefined,
    timelineEnd: input.timelineEnd?.trim() || undefined,
    fillTimelineMonth: input.fillTimelineMonth === true ? true : undefined,
    timelineBucketFieldKey:
      dim === "BY_DAY" && timelineBucketTrim ? timelineBucketTrim : undefined,
    groupByCustomFieldKey:
      dim === "BY_CUSTOM_VALUE" && groupByTrim ? groupByTrim : undefined,
    byDayAnchor:
      dim === "BY_DAY" && input.byDayAnchor === "UPDATED_AT"
        ? "UPDATED_AT"
        : undefined,
    gaugeTargetMoney:
      typeof input.gaugeTargetMoney === "number" &&
      Number.isFinite(input.gaugeTargetMoney)
        ? input.gaugeTargetMoney
        : undefined,
    rankingLimit:
      typeof input.rankingLimit === "number" &&
      Number.isFinite(input.rankingLimit)
        ? Math.min(30, Math.max(3, Math.floor(input.rankingLimit)))
        : undefined,
    dataMeasure,
    aggregation,
    customFieldKey: input.customFieldKey,
    filterStatuses,
    filterTagMatch: filterGroups ? undefined : input.filterTagMatch,
    filterTagIds: filterGroups ? undefined : input.filterTagIds,
    filterCreatedFrom: filterGroups ? undefined : input.filterCreatedFrom,
    filterCreatedTo: filterGroups ? undefined : input.filterCreatedTo,
    filterUpdatedFrom: filterGroups ? undefined : input.filterUpdatedFrom,
    filterUpdatedTo: filterGroups ? undefined : input.filterUpdatedTo,
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
    if (
      val.dimension === "BY_CUSTOM_VALUE" &&
      !val.groupByCustomFieldKey?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "groupByCustomFieldKey é obrigatório quando a dimensão é valor de campo customizado",
        path: ["groupByCustomFieldKey"],
      });
    }
    if (val.dimension === "BY_GOAL_PROGRESS") {
      if (val.gaugeTargetMoney == null || val.gaugeTargetMoney <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "gaugeTargetMoney deve ser > 0 para meta / atingimento",
          path: ["gaugeTargetMoney"],
        });
      }
      if (val.dataMeasure && val.dataMeasure !== "MONEY") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Meta / atingimento usa medida Valor (R$)",
          path: ["dataMeasure"],
        });
      }
    }

    const ts = val.timelineStart?.trim();
    const te = val.timelineEnd?.trim();
    if (te) {
      if (!ts) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timelineEnd exige timelineStart",
          path: ["timelineEnd"],
        });
      } else if (te < ts) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timelineEnd não pode ser anterior a timelineStart",
          path: ["timelineEnd"],
        });
      } else if (countYmdRangeDaysInclusive(ts, te) > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Intervalo na linha do tempo excede 500 dias",
          path: ["timelineEnd"],
        });
      }
    }
  },
);

export type WidgetQuerySpec = z.infer<typeof widgetQuerySpecSchema>;

export const widgetQueryBulkSchema = z.object({
  specs: z.array(widgetQuerySpecSchema).max(48),
});
