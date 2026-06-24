import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DealStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  addCalendarDaysIso,
  enumerateYmdInclusive,
  endOfMonthYmd,
  minYmd,
  todayYmdBrazil,
} from "../common/calendar-brazil.util";
import {
  isoRangeFromRollingPreset,
  jsonDateStringLteUpperBound,
  isWidgetFilterRollingDatePreset,
} from "./dashboard-custom-date-preset.util";
import {
  resolveWidgetQuerySpec,
  widgetQuerySpecSchema,
  type ResolvedWidgetQuerySpec,
  type WidgetFilterRowInput,
} from "./dashboard-widget-spec.zod";

export type ScalarResult = { kind: "scalar"; value: number };
export type SeriesResult = {
  kind: "series";
  series: { label: string; value: number }[];
};

export type RankingRow = {
  rank: number;
  name: string;
  primaryValue: number;
  secondaryValue: number;
};

export type RankingResult = {
  kind: "ranking";
  variant: "product" | "assignee";
  rows: RankingRow[];
};

export type FunnelLayerRow = {
  key: "lead" | "qualified" | "proposal" | "sale";
  label: string;
  /** Valor cumulativo: deals cuja etapa está nesta camada ou em camadas mais baixas no funil. */
  value: number;
  /** Taxa em relação à camada anterior (cumulativa); null na primeira camada ou se o anterior for 0. */
  conversionFromPreviousPct: number | null;
};

export type FunnelResult = {
  kind: "funnel";
  layers: FunnelLayerRow[];
};

function startOfDayUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function endOfDayUtc(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

function extractJsonNumber(
  customData: Prisma.JsonValue | null,
  key: string,
): number | null {
  if (customData == null || typeof customData !== "object" || Array.isArray(customData)) {
    return null;
  }
  const v = (customData as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/** Valor de campo DATE em customData → YYYY-MM-DD (ou null). */
function extractIsoDateKeyFromCustomData(
  customData: Prisma.JsonValue | null,
  key: string,
): string | null {
  if (customData == null || typeof customData !== "object" || Array.isArray(customData)) {
    return null;
  }
  const v = (customData as Record<string, unknown>)[key];
  if (v == null || v === "") return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

const EMPTY_BUCKET = "__empty__";

function rawCustomValueForGroup(
  customData: Prisma.JsonValue | null,
  key: string,
): unknown {
  if (customData == null || typeof customData !== "object" || Array.isArray(customData)) {
    return null;
  }
  return (customData as Record<string, unknown>)[key];
}

function internalBucketKeyFromRaw(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return EMPTY_BUCKET;
  if (typeof raw === "number" && Number.isFinite(raw)) return `n:${raw}`;
  if (typeof raw === "boolean") return raw ? "b:true" : "b:false";
  const s = String(raw).trim();
  return s.length === 0 ? EMPTY_BUCKET : `s:${s}`;
}

function labelFromInternalBucketKey(internalKey: string): string {
  if (internalKey === EMPTY_BUCKET) return "(vazio)";
  if (internalKey.startsWith("n:")) return internalKey.slice(2);
  if (internalKey.startsWith("b:")) return internalKey === "b:true" ? "Sim" : "Não";
  if (internalKey.startsWith("s:")) return internalKey.slice(2);
  return internalKey;
}

function sortSeriesPtBr(
  series: { label: string; value: number }[],
  emptyLabels: string[],
): { label: string; value: number }[] {
  const emptySet = new Set(emptyLabels);
  return [...series].sort((a, b) => {
    const ae = emptySet.has(a.label);
    const be = emptySet.has(b.label);
    if (ae !== be) return ae ? 1 : -1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

@Injectable()
export class DashboardQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(
    tenantId: string,
    raw: unknown,
  ): Promise<ScalarResult | SeriesResult | RankingResult | FunnelResult> {
    const input = widgetQuerySpecSchema.parse(raw);
    const spec = resolveWidgetQuerySpec(input);
    await this.assertPipeline(tenantId, spec.pipelineId);
    await this.assertCustomFieldIfNeeded(tenantId, spec);
    return this.runQuery(tenantId, spec);
  }

  async queryBulk(
    tenantId: string,
    specs: unknown[],
  ): Promise<(ScalarResult | SeriesResult | RankingResult | FunnelResult)[]> {
    if (specs.length === 0) return [];

    const resolved = specs.map((s) => {
      const input = widgetQuerySpecSchema.parse(s);
      return resolveWidgetQuerySpec(input);
    });

    const uniquePipelineIds = [...new Set(resolved.map((r) => r.pipelineId))];
    await Promise.all(
      uniquePipelineIds.map((id) => this.assertPipeline(tenantId, id)),
    );

    await Promise.all(
      resolved.map((spec) => this.assertCustomFieldIfNeeded(tenantId, spec)),
    );

    return Promise.all(
      resolved.map((spec) => this.runQuery(tenantId, spec)),
    );
  }

  private async assertPipeline(tenantId: string, pipelineId: string) {
    const p = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException("Pipeline não encontrado");
  }

  /** Garante chave de medida numérica e/ou campo DATE do eixo temporal. */
  private async assertCustomFieldIfNeeded(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ) {
    if (spec.dataMeasure === "AVG_CYCLE_DAYS") return;
    if (spec.dimension === "BY_GOAL_PROGRESS") return;
    if (spec.dimension === "BY_FUNNEL_LAYERS") return;
    if (
      spec.dimension === "BY_PRODUCT_SOLD" ||
      spec.dimension === "BY_ASSIGNEE_RANKED_SALES"
    ) {
      return;
    }
    if (spec.dataMeasure === "CUSTOM_NUMBER" && spec.customFieldKey) {
      const cf = await this.prisma.customField.findFirst({
        where: {
          tenantId,
          entity: "DEAL",
          key: spec.customFieldKey,
        },
        select: { fieldType: true },
      });
      if (!cf) {
        throw new BadRequestException("Campo customizado inválido para este tenant");
      }
      if (cf.fieldType !== "NUMBER" && cf.fieldType !== "MONEY_BRL") {
        throw new BadRequestException(
          "A medida Número só aceita campos do tipo Número ou Dinheiro (R$)",
        );
      }
    }
    if (spec.timelineBucketFieldKey) {
      const cf = await this.prisma.customField.findFirst({
        where: {
          tenantId,
          entity: "DEAL",
          key: spec.timelineBucketFieldKey,
        },
        select: { fieldType: true },
      });
      if (!cf) {
        throw new BadRequestException("Campo do eixo temporal inválido para este tenant");
      }
      if (cf.fieldType !== "DATE") {
        throw new BadRequestException(
          "Agrupar linha do tempo por data só aceita campos do tipo Data",
        );
      }
    }
    if (spec.dimension === "BY_CUSTOM_VALUE" && spec.groupByCustomFieldKey) {
      const cf = await this.prisma.customField.findFirst({
        where: {
          tenantId,
          entity: "DEAL",
          key: spec.groupByCustomFieldKey,
        },
        select: { fieldType: true },
      });
      if (!cf) {
        throw new BadRequestException("Campo do eixo X inválido para este tenant");
      }
      if (cf.fieldType === "DATE") {
        throw new BadRequestException(
          "Para campo Data no eixo X use a linha do tempo (período + agrupar por dias/semanas)",
        );
      }
    }
  }

  private buildWhere(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Prisma.DealWhereInput {
    const and: Prisma.DealWhereInput[] = [
      { tenantId },
      { pipelineId: spec.pipelineId },
      { pipelineVisible: true },
    ];

    if (spec.filterGroups && spec.filterGroups.length > 0) {
      const grouped = this.buildWhereFromFilterGroups(spec.filterGroups);
      and.push(grouped);
    } else {
      and.push({ status: { in: spec.filterStatuses } });

      if (spec.filterTagIds && spec.filterTagIds.length > 0) {
        const byTag = (tid: string) => ({
          dealTags: { some: { tagId: tid } },
        });
        if (spec.filterTagMatch === "ANY") {
          and.push({
            OR: spec.filterTagIds.map((tid) => byTag(tid)),
          });
        } else {
          and.push({
            AND: spec.filterTagIds.map((tid) => byTag(tid)),
          });
        }
      }

      if (spec.filterCreatedFrom || spec.filterCreatedTo) {
        const range: Prisma.DateTimeFilter = {};
        if (spec.filterCreatedFrom) {
          range.gte = startOfDayUtc(spec.filterCreatedFrom);
        }
        if (spec.filterCreatedTo) {
          range.lte = endOfDayUtc(spec.filterCreatedTo);
        }
        and.push({ createdAt: range });
      }

      if (spec.filterUpdatedFrom || spec.filterUpdatedTo) {
        const range: Prisma.DateTimeFilter = {};
        if (spec.filterUpdatedFrom) {
          range.gte = startOfDayUtc(spec.filterUpdatedFrom);
        }
        if (spec.filterUpdatedTo) {
          range.lte = endOfDayUtc(spec.filterUpdatedTo);
        }
        and.push({ updatedAt: range });
      }

      if (spec.filterCustomFields && spec.filterCustomFields.length > 0) {
        for (const f of spec.filterCustomFields) {
          and.push({
            customData: {
              path: [f.key],
              equals: f.value as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    return { AND: and };
  }

  /** E/Ou entre linhas (esquerda-associativo); E/Ou entre grupos. */
  private buildWhereFromFilterGroups(
    groups: NonNullable<ResolvedWidgetQuerySpec["filterGroups"]>,
  ): Prisma.DealWhereInput {
    const foldedGroups: Prisma.DealWhereInput[] = [];
    for (const g of groups) {
      const w = this.foldGroupRows(g.rows);
      foldedGroups.push(
        w ?? { status: { in: [DealStatus.OPEN, DealStatus.WON, DealStatus.LOST, DealStatus.ARCHIVED] } },
      );
    }
    let acc: Prisma.DealWhereInput = foldedGroups[0]!;
    for (let i = 1; i < foldedGroups.length; i++) {
      const join = groups[i]!.groupJoin ?? "OR";
      const next = foldedGroups[i]!;
      acc =
        join === "AND"
          ? { AND: [acc, next] }
          : { OR: [acc, next] };
    }
    return acc;
  }

  private foldGroupRows(rows: WidgetFilterRowInput[]): Prisma.DealWhereInput | null {
    let acc: Prisma.DealWhereInput | null = null;
    for (let i = 0; i < rows.length; i++) {
      const w = this.rowToWhereFragment(rows[i]!);
      if (w == null) continue;
      if (acc == null) {
        acc = w;
        continue;
      }
      const join = rows[i]!.rowJoin ?? "AND";
      acc = join === "AND" ? { AND: [acc, w] } : { OR: [acc, w] };
    }
    return acc;
  }

  private rowToWhereFragment(row: WidgetFilterRowInput): Prisma.DealWhereInput | null {
    switch (row.field) {
      case "status": {
        const codes =
          row.statusCodes && row.statusCodes.length > 0
            ? row.statusCodes
            : [DealStatus.OPEN];
        const stageIds = (row.stageIds ?? []).map((id) => id.trim()).filter(Boolean);
        const statusPart: Prisma.DealWhereInput = {
          status: { in: codes as DealStatus[] },
        };
        if (stageIds.length === 0) return statusPart;
        return { AND: [statusPart, { stageId: { in: stageIds } }] };
      }
      case "tags": {
        if (!row.tagIds || row.tagIds.length === 0) return null;
        const byTag = (tid: string) => ({
          dealTags: { some: { tagId: tid } },
        });
        const any =
          row.filterTagMatch === "ANY" || row.op === "OR";
        return any
          ? { OR: row.tagIds.map((tid) => byTag(tid)) }
          : { AND: row.tagIds.map((tid) => byTag(tid)) };
      }
      case "createdAt": {
        if (!row.createdFrom?.trim() && !row.createdTo?.trim()) return null;
        const range: Prisma.DateTimeFilter = {};
        if (row.createdFrom?.trim()) {
          range.gte = startOfDayUtc(row.createdFrom.trim());
        }
        if (row.createdTo?.trim()) {
          range.lte = endOfDayUtc(row.createdTo.trim());
        }
        return { createdAt: range };
      }
      case "updatedAt": {
        if (!row.createdFrom?.trim() && !row.createdTo?.trim()) return null;
        const range: Prisma.DateTimeFilter = {};
        if (row.createdFrom?.trim()) {
          range.gte = startOfDayUtc(row.createdFrom.trim());
        }
        if (row.createdTo?.trim()) {
          range.lte = endOfDayUtc(row.createdTo.trim());
        }
        return { updatedAt: range };
      }
      case "customField": {
        const k = row.customKey?.trim();
        if (!k) return null;
        const df = row.customDateFrom?.trim();
        const dt = row.customDateTo?.trim();
        if (df || dt) {
          const parts: Prisma.DealWhereInput[] = [];
          if (df) {
            parts.push({
              customData: {
                path: [k],
                gte: df,
              },
            });
          }
          if (dt) {
            parts.push({
              customData: {
                path: [k],
                lte: jsonDateStringLteUpperBound(dt),
              },
            });
          }
          if (parts.length === 0) return null;
          return parts.length === 1 ? parts[0]! : { AND: parts };
        }
        if (isWidgetFilterRollingDatePreset(row.customDatePreset)) {
          const range = isoRangeFromRollingPreset(
            new Date(),
            row.customDatePreset,
          );
          if (!range) return null;
          return {
            AND: [
              { customData: { path: [k], gte: range.from } },
              {
                customData: {
                  path: [k],
                  lte: jsonDateStringLteUpperBound(range.to),
                },
              },
            ],
          };
        }
        if (row.customValue === undefined || row.customValue === "") return null;
        return {
          customData: {
            path: [k],
            equals: row.customValue as Prisma.InputJsonValue,
          },
        };
      }
      default:
        return null;
    }
  }

  private async runQuery(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<ScalarResult | SeriesResult | RankingResult | FunnelResult> {
    const dim = spec.dimension ?? null;
    if (dim == null) {
      return this.scalar(tenantId, spec);
    }
    if (dim === "BY_STAGE") {
      return this.byStage(tenantId, spec);
    }
    if (dim === "BY_STATUS") {
      return this.byStatus(tenantId, spec);
    }
    if (dim === "BY_DAY") {
      return this.byDay(tenantId, spec);
    }
    if (dim === "BY_ASSIGNEE") {
      return this.byAssignee(tenantId, spec);
    }
    if (dim === "BY_CUSTOM_VALUE") {
      return this.byCustomFieldValue(tenantId, spec);
    }
    if (dim === "BY_GOAL_PROGRESS") {
      return this.goalProgress(tenantId, spec);
    }
    if (dim === "BY_PRODUCT_SOLD") {
      return this.byProductSold(tenantId, spec);
    }
    if (dim === "BY_ASSIGNEE_RANKED_SALES") {
      return this.byAssigneeRankedSales(tenantId, spec);
    }
    if (dim === "BY_FUNNEL_LAYERS") {
      return this.byFunnelLayers(tenantId, spec);
    }
    throw new BadRequestException("Dimensão inválida");
  }

  private uniqStageIds(ids: string[]): string[] {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  private async assertFunnelStageIdsBelongToPipeline(
    tenantId: string,
    pipelineId: string,
    stageIds: string[],
  ) {
    if (stageIds.length === 0) return;
    const n = await this.prisma.stage.count({
      where: {
        id: { in: stageIds },
        pipelineId,
        pipeline: { tenantId },
      },
    });
    if (n !== stageIds.length) {
      throw new BadRequestException(
        "Uma ou mais etapas do funil não pertencem a este pipeline",
      );
    }
  }

  /** Agrega deals cuja etapa está em `stageIds` (vazio → 0). */
  private async aggregateDealsForStages(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
    stageIds: string[],
  ): Promise<number> {
    if (stageIds.length === 0) return 0;
    const base = this.buildWhere(tenantId, spec);
    const where: Prisma.DealWhereInput = {
      AND: [base, { stageId: { in: stageIds } }],
    };
    if (spec.dataMeasure === "QUANTITY") {
      return this.prisma.deal.count({ where });
    }
    if (spec.dataMeasure === "MONEY") {
      if (spec.aggregation === "AVG") {
        const agg = await this.prisma.deal.aggregate({
          where,
          _avg: { value: true },
        });
        return Number(agg._avg.value ?? 0);
      }
      const agg = await this.prisma.deal.aggregate({
        where,
        _sum: { value: true },
      });
      return Number(agg._sum.value ?? 0);
    }
    throw new BadRequestException("Funil em camadas aceita só Quantidade ou Valor (R$)");
  }

  /**
   * Funil em 4 camadas: contagens (ou valores) cumulativas por etapa do pipeline.
   * Ex.: "Qualificado" inclui deals em etapas mapeadas como qualificado, proposta ou venda.
   */
  private async byFunnelLayers(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<FunnelResult> {
    const fl = spec.funnelLayerStageIds;
    if (!fl) {
      throw new BadRequestException("funnelLayerStageIds é obrigatório para o funil");
    }
    const leadIds = this.uniqStageIds(fl.lead);
    const qualIds = this.uniqStageIds(fl.qualified);
    const propIds = this.uniqStageIds(fl.proposal);
    const saleIds = this.uniqStageIds(fl.sale);
    const allIds = this.uniqStageIds([...leadIds, ...qualIds, ...propIds, ...saleIds]);
    await this.assertFunnelStageIdsBelongToPipeline(
      tenantId,
      spec.pipelineId,
      allIds,
    );

    const saleUnion = [...saleIds];
    const proposalUnion = this.uniqStageIds([...propIds, ...saleIds]);
    const qualifiedUnion = this.uniqStageIds([...qualIds, ...propIds, ...saleIds]);
    const leadUnion = this.uniqStageIds([
      ...leadIds,
      ...qualIds,
      ...propIds,
      ...saleIds,
    ]);

    const defs = [
      { key: "lead" as const, label: "Lead", stageIds: leadUnion },
      { key: "qualified" as const, label: "Qualificado", stageIds: qualifiedUnion },
      { key: "proposal" as const, label: "Proposta", stageIds: proposalUnion },
      { key: "sale" as const, label: "Venda", stageIds: saleUnion },
    ];

    const values: number[] = [];
    for (const d of defs) {
      values.push(
        await this.aggregateDealsForStages(tenantId, spec, d.stageIds),
      );
    }

    const layers: FunnelLayerRow[] = defs.map((d, i) => {
      const value = values[i]!;
      let conversionFromPreviousPct: number | null = null;
      if (i > 0) {
        const prev = values[i - 1]!;
        conversionFromPreviousPct =
          prev > 0 ? Math.round((value / prev) * 1000) / 10 : null;
      }
      return {
        key: d.key,
        label: d.label,
        value,
        conversionFromPreviousPct,
      };
    });

    return { kind: "funnel", layers };
  }

  private async scalar(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<ScalarResult> {
    const where = this.buildWhere(tenantId, spec);
    if (spec.dataMeasure === "AVG_CYCLE_DAYS") {
      const rows = await this.prisma.deal.findMany({
        where,
        select: { createdAt: true, updatedAt: true },
        take: 10_000,
      });
      if (rows.length === 0) {
        return { kind: "scalar", value: 0 };
      }
      let sumMs = 0;
      for (const r of rows) {
        sumMs += Math.max(0, r.updatedAt.getTime() - r.createdAt.getTime());
      }
      const days = sumMs / rows.length / 86_400_000;
      return { kind: "scalar", value: Math.round(days * 10) / 10 };
    }
    if (spec.dataMeasure === "QUANTITY") {
      const value = await this.prisma.deal.count({ where });
      return { kind: "scalar", value };
    }
    if (spec.dataMeasure === "MONEY") {
      if (spec.aggregation === "AVG") {
        const agg = await this.prisma.deal.aggregate({
          where,
          _avg: { value: true },
        });
        return { kind: "scalar", value: Number(agg._avg.value ?? 0) };
      }
      const agg = await this.prisma.deal.aggregate({
        where,
        _sum: { value: true },
      });
      return { kind: "scalar", value: Number(agg._sum.value ?? 0) };
    }
    const key = spec.customFieldKey!;
    const rows = await this.prisma.deal.findMany({
      where,
      select: { customData: true },
    });
    const nums = rows
      .map((r) => extractJsonNumber(r.customData, key))
      .filter((n): n is number => n != null);
    if (nums.length === 0) {
      return { kind: "scalar", value: 0 };
    }
    if (spec.aggregation === "AVG") {
      const s = nums.reduce((a, b) => a + b, 0);
      return { kind: "scalar", value: s / nums.length };
    }
    return { kind: "scalar", value: nums.reduce((a, b) => a + b, 0) };
  }

  private async byStage(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const where = this.buildWhere(tenantId, spec);
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: spec.pipelineId, tenantId },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pipeline) throw new NotFoundException("Pipeline não encontrado");

    if (spec.dataMeasure === "QUANTITY") {
      const rows = await this.prisma.deal.groupBy({
        by: ["stageId"],
        where,
        _count: { _all: true },
      });
      const map = new Map(rows.map((r) => [r.stageId, r._count._all]));
      const series = pipeline.stages.map((s) => ({
        label: s.name,
        value: map.get(s.id) ?? 0,
      }));
      return { kind: "series", series };
    }

    if (spec.dataMeasure === "MONEY") {
      if (spec.aggregation === "AVG") {
        const rows = await this.prisma.deal.groupBy({
          by: ["stageId"],
          where,
          _avg: { value: true },
        });
        const map = new Map(
          rows.map((r) => [r.stageId, Number(r._avg.value ?? 0)]),
        );
        const series = pipeline.stages.map((s) => ({
          label: s.name,
          value: map.get(s.id) ?? 0,
        }));
        return { kind: "series", series };
      }
      const rows = await this.prisma.deal.groupBy({
        by: ["stageId"],
        where,
        _sum: { value: true },
      });
      const map = new Map(
        rows.map((r) => [r.stageId, Number(r._sum.value ?? 0)]),
      );
      const series = pipeline.stages.map((s) => ({
        label: s.name,
        value: map.get(s.id) ?? 0,
      }));
      return { kind: "series", series };
    }

    const key = spec.customFieldKey!;
    const rows = await this.prisma.deal.findMany({
      where,
      select: { stageId: true, customData: true },
    });
    const byStage = new Map<string, number[]>();
    for (const r of rows) {
      const n = extractJsonNumber(r.customData, key);
      if (n == null) continue;
      const arr = byStage.get(r.stageId) ?? [];
      arr.push(n);
      byStage.set(r.stageId, arr);
    }
    const series = pipeline.stages.map((s) => {
      const nums = byStage.get(s.id) ?? [];
      if (nums.length === 0) return { label: s.name, value: 0 };
      if (spec.aggregation === "AVG") {
        const t = nums.reduce((a, b) => a + b, 0);
        return { label: s.name, value: t / nums.length };
      }
      return { label: s.name, value: nums.reduce((a, b) => a + b, 0) };
    });
    return { kind: "series", series };
  }

  private async byStatus(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const where = this.buildWhere(tenantId, spec);
    const labels: Record<DealStatus, string> = {
      OPEN: "Aberto",
      WON: "Ganho",
      LOST: "Perdido",
      ARCHIVED: "Arquivado",
    };

    if (spec.dataMeasure === "QUANTITY") {
      const rows = await this.prisma.deal.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      });
      const series = rows.map((r) => ({
        label: labels[r.status],
        value: r._count._all,
      }));
      return { kind: "series", series };
    }

    if (spec.dataMeasure === "MONEY") {
      if (spec.aggregation === "AVG") {
        const rows = await this.prisma.deal.groupBy({
          by: ["status"],
          where,
          _avg: { value: true },
        });
        const series = rows.map((r) => ({
          label: labels[r.status],
          value: Number(r._avg.value ?? 0),
        }));
        return { kind: "series", series };
      }
      const rows = await this.prisma.deal.groupBy({
        by: ["status"],
        where,
        _sum: { value: true },
      });
      const series = rows.map((r) => ({
        label: labels[r.status],
        value: Number(r._sum.value ?? 0),
      }));
      return { kind: "series", series };
    }

    const key = spec.customFieldKey!;
    const rows = await this.prisma.deal.findMany({
      where,
      select: { status: true, customData: true },
    });
    const bySt = new Map<DealStatus, number[]>();
    for (const r of rows) {
      const n = extractJsonNumber(r.customData, key);
      if (n == null) continue;
      const arr = bySt.get(r.status) ?? [];
      arr.push(n);
      bySt.set(r.status, arr);
    }
    const series = (Object.keys(labels) as DealStatus[])
      .filter((st) => {
        const nums = bySt.get(st);
        return nums && nums.length > 0;
      })
      .map((st) => {
        const nums = bySt.get(st)!;
        if (spec.aggregation === "AVG") {
          const t = nums.reduce((a, b) => a + b, 0);
          return { label: labels[st], value: t / nums.length };
        }
        return { label: labels[st], value: nums.reduce((a, b) => a + b, 0) };
      });
    return { kind: "series", series };
  }

  /** Meta vs realizado (R$) — duas fatias para gráfico tipo gauge. */
  private async goalProgress(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const target = spec.gaugeTargetMoney ?? 0;
    const where = this.buildWhere(tenantId, spec);
    const agg = await this.prisma.deal.aggregate({
      where,
      _sum: { value: true },
    });
    const won = Number(agg._sum.value ?? 0);
    const done = target > 0 ? Math.min(won, target) : won;
    const rest = target > 0 ? Math.max(0, target - won) : 0;
    return {
      kind: "series",
      series: [
        { label: "Realizado", value: done },
        { label: "Restante", value: rest },
      ],
    };
  }

  /** Linhas de produto em oportunidades filtradas — ranqueia por quantidade, mostra valor (R$) na secundária. */
  private async byProductSold(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<RankingResult> {
    const where = this.buildWhere(tenantId, spec);
    const limit = spec.rankingLimit ?? 10;
    const dealIds = await this.prisma.deal.findMany({
      where,
      select: { id: true },
      take: 15_000,
    });
    if (dealIds.length === 0) {
      return { kind: "ranking", variant: "product", rows: [] };
    }
    const ids = dealIds.map((d) => d.id);
    const lines = await this.prisma.dealItem.findMany({
      where: { tenantId, dealId: { in: ids } },
      select: { productName: true, quantity: true, unitPrice: true },
    });
    const map = new Map<string, { qty: number; rev: number }>();
    for (const r of lines) {
      const name = (r.productName ?? "").trim() || "(Sem nome)";
      const q = Number(r.quantity);
      const p = Number(r.unitPrice);
      if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
      const cur = map.get(name) ?? { qty: 0, rev: 0 };
      cur.qty += q;
      cur.rev += q * p;
      map.set(name, cur);
    }
    const rows = [...map.entries()]
      .map(([name, { qty, rev }]) => ({
        rank: 0,
        name,
        primaryValue: qty,
        secondaryValue: rev,
      }))
      .sort(
        (a, b) =>
          b.primaryValue - a.primaryValue ||
          a.name.localeCompare(b.name, "pt-BR"),
      )
      .slice(0, limit)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return { kind: "ranking", variant: "product", rows };
  }

  /** Responsáveis — ranqueia por valor (R$) somado, secundária = nº de pedidos (oportunidades). */
  private async byAssigneeRankedSales(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<RankingResult> {
    const where = this.buildWhere(tenantId, spec);
    const limit = spec.rankingLimit ?? 10;
    const emptyLabel = "Sem responsável";

    const rows = await this.prisma.deal.groupBy({
      by: ["assignedToId"],
      where,
      _sum: { value: true },
      _count: { _all: true },
    });

    const labelBy = new Map<string | null, string>();
    labelBy.set(null, emptyLabel);
    const userIds = [
      ...new Set(
        rows
          .map((r) => r.assignedToId)
          .filter((id): id is string => id != null && id.length > 0),
      ),
    ];
    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { tenantId, id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) {
        const n = u.name?.trim();
        labelBy.set(u.id, n && n.length > 0 ? n : (u.email ?? u.id));
      }
      for (const id of userIds) {
        if (!labelBy.has(id)) labelBy.set(id, id);
      }
    }

    const decorated = rows.map((r) => {
      const name = labelBy.get(r.assignedToId) ?? emptyLabel;
      const money = Number(r._sum.value ?? 0);
      const count = r._count._all;
      return {
        name,
        primaryValue: money,
        secondaryValue: count,
        empty: name === emptyLabel,
      };
    });

    decorated.sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      if (b.primaryValue !== a.primaryValue) {
        return b.primaryValue - a.primaryValue;
      }
      return a.name.localeCompare(b.name, "pt-BR");
    });

    const sliced = decorated.slice(0, limit);
    const out: RankingRow[] = sliced.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      primaryValue: r.primaryValue,
      secondaryValue: r.secondaryValue,
    }));

    return { kind: "ranking", variant: "assignee", rows: out };
  }

  private async byDay(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const baseWhere = this.buildWhere(tenantId, spec);
    const bucketKey = spec.timelineBucketFieldKey;

    let dateKeys: string[];
    let sinceForCreatedFilter: Date;

    if (spec.timelineStart?.trim()) {
      const startKey = spec.timelineStart.trim();
      const todayBr = todayYmdBrazil();
      const timelineEndTrim = spec.timelineEnd?.trim();
      if (timelineEndTrim) {
        const endKey = minYmd(timelineEndTrim, todayBr);
        if (startKey > endKey) {
          dateKeys = [];
        } else {
          dateKeys = enumerateYmdInclusive(startKey, endKey);
        }
        sinceForCreatedFilter = startOfDayUtc(startKey);
      } else {
        const monthEndYmd = endOfMonthYmd(startKey);
        const endKey =
          spec.fillTimelineMonth === true
            ? monthEndYmd
            : minYmd(todayBr, monthEndYmd);
        dateKeys = enumerateYmdInclusive(startKey, endKey);
        if (dateKeys.length === 0) {
          dateKeys = [];
        }
        sinceForCreatedFilter = startOfDayUtc(startKey);
      }
    } else {
      const days = Math.min(366, Math.max(1, spec.days ?? 30));
      const todayBr = todayYmdBrazil();
      dateKeys = [];
      for (let i = days - 1; i >= 0; i--) {
        dateKeys.push(addCalendarDaysIso(todayBr, -i));
      }
      sinceForCreatedFilter = startOfDayUtc(dateKeys[0] ?? todayBr);
    }

    if (dateKeys.length === 0) {
      return { kind: "series", series: [] };
    }

    const firstKey = dateKeys[0] ?? todayYmdBrazil();
    const lastKey = dateKeys[dateKeys.length - 1] ?? firstKey;

    const byDayAnchor =
      spec.byDayAnchor === "UPDATED_AT" ? "UPDATED_AT" : "CREATED_AT";

    const where: Prisma.DealWhereInput = bucketKey
      ? {
          AND: [
            baseWhere,
            { customData: { path: [bucketKey], gte: firstKey } },
            {
              customData: {
                path: [bucketKey],
                lte: jsonDateStringLteUpperBound(lastKey),
              },
            },
          ],
        }
      : byDayAnchor === "UPDATED_AT"
        ? {
            AND: [
              baseWhere,
              {
                updatedAt: {
                  gte: startOfDayUtc(firstKey),
                  lte: endOfDayUtc(lastKey),
                },
              },
            ],
          }
        : {
            AND: [baseWhere, { createdAt: { gte: sinceForCreatedFilter } }],
          };

    const rows = await this.prisma.deal.findMany({
      where,
      select: { createdAt: true, updatedAt: true, value: true, customData: true },
    });

    const measureKey = spec.customFieldKey;
    const keySet = new Set(dateKeys);
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const dkey = bucketKey
        ? extractIsoDateKeyFromCustomData(r.customData, bucketKey)
        : byDayAnchor === "UPDATED_AT"
          ? r.updatedAt.toISOString().slice(0, 10)
          : r.createdAt.toISOString().slice(0, 10);
      if (dkey == null) continue;
      if (!keySet.has(dkey)) continue;
      let v: number;
      if (spec.dataMeasure === "QUANTITY") {
        v = 1;
      } else if (spec.dataMeasure === "MONEY") {
        v = Number(r.value ?? 0);
      } else {
        const n = extractJsonNumber(r.customData, measureKey!);
        if (n == null) continue;
        v = n;
      }
      const arr = map.get(dkey) ?? [];
      arr.push(v);
      map.set(dkey, arr);
    }

    const series: { label: string; value: number }[] = [];
    for (const dkey of dateKeys) {
      const arr = map.get(dkey) ?? [];
      let value: number;
      if (spec.dataMeasure === "QUANTITY") {
        value = arr.length;
      } else if (spec.aggregation === "AVG" && arr.length > 0) {
        value = arr.reduce((a, b) => a + b, 0) / arr.length;
      } else {
        value = arr.reduce((a, b) => a + b, 0);
      }
      series.push({ label: dkey, value });
    }
    return { kind: "series", series };
  }

  private async byAssignee(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const where = this.buildWhere(tenantId, spec);
    const emptyLabel = "Sem responsável";

    const resolveLabels = async (
      rows: { assignedToId: string | null }[],
    ): Promise<Map<string | null, string>> => {
      const map = new Map<string | null, string>();
      map.set(null, emptyLabel);
      const ids = [
        ...new Set(
          rows
            .map((r) => r.assignedToId)
            .filter((id): id is string => id != null && id.length > 0),
        ),
      ];
      if (ids.length > 0) {
        const users = await this.prisma.user.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, name: true, email: true },
        });
        for (const u of users) {
          const n = u.name?.trim();
          map.set(u.id, n && n.length > 0 ? n : u.email);
        }
        for (const id of ids) {
          if (!map.has(id)) map.set(id, id);
        }
      }
      return map;
    };

    if (spec.dataMeasure === "QUANTITY") {
      const rows = await this.prisma.deal.groupBy({
        by: ["assignedToId"],
        where,
        _count: { _all: true },
      });
      const labelBy = await resolveLabels(rows);
      const series = rows.map((r) => ({
        label: labelBy.get(r.assignedToId) ?? emptyLabel,
        value: r._count._all,
      }));
      return {
        kind: "series",
        series: sortSeriesPtBr(series, [emptyLabel]),
      };
    }

    if (spec.dataMeasure === "MONEY") {
      if (spec.aggregation === "AVG") {
        const rows = await this.prisma.deal.groupBy({
          by: ["assignedToId"],
          where,
          _avg: { value: true },
        });
        const labelBy = await resolveLabels(rows);
        const series = rows.map((r) => ({
          label: labelBy.get(r.assignedToId) ?? emptyLabel,
          value: Number(r._avg.value ?? 0),
        }));
        return {
          kind: "series",
          series: sortSeriesPtBr(series, [emptyLabel]),
        };
      }
      const rows = await this.prisma.deal.groupBy({
        by: ["assignedToId"],
        where,
        _sum: { value: true },
      });
      const labelBy = await resolveLabels(rows);
      const series = rows.map((r) => ({
        label: labelBy.get(r.assignedToId) ?? emptyLabel,
        value: Number(r._sum.value ?? 0),
      }));
      return {
        kind: "series",
        series: sortSeriesPtBr(series, [emptyLabel]),
      };
    }

    const numKey = spec.customFieldKey!;
    const rows = await this.prisma.deal.findMany({
      where,
      select: { assignedToId: true, customData: true },
    });
    const map = new Map<string | null, number[]>();
    for (const r of rows) {
      const n = extractJsonNumber(r.customData, numKey);
      if (n == null) continue;
      const k = r.assignedToId;
      const arr = map.get(k) ?? [];
      arr.push(n);
      map.set(k, arr);
    }
    const pseudoRows = [...map.keys()].map((assignedToId) => ({ assignedToId }));
    const labelBy = await resolveLabels(pseudoRows);
    const series = [...map.entries()].map(([aid, nums]) => {
      const label = labelBy.get(aid) ?? emptyLabel;
      if (spec.aggregation === "AVG") {
        const t = nums.reduce((a, b) => a + b, 0);
        return { label, value: t / nums.length };
      }
      return { label, value: nums.reduce((a, b) => a + b, 0) };
    });
    return {
      kind: "series",
      series: sortSeriesPtBr(series, [emptyLabel]),
    };
  }

  private async byCustomFieldValue(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const gk = spec.groupByCustomFieldKey!;
    const where = this.buildWhere(tenantId, spec);
    const cf = await this.prisma.customField.findFirst({
      where: { tenantId, entity: "DEAL", key: gk },
      select: { fieldType: true },
    });
    if (!cf) throw new NotFoundException("Campo customizado não encontrado");

    const measureKey = spec.customFieldKey;
    const rows = await this.prisma.deal.findMany({
      where,
      select: { customData: true, value: true },
    });

    const map = new Map<string, number[]>();
    for (const r of rows) {
      const raw = rawCustomValueForGroup(r.customData, gk);
      const bk = internalBucketKeyFromRaw(raw);
      let v: number;
      if (spec.dataMeasure === "QUANTITY") {
        v = 1;
      } else if (spec.dataMeasure === "MONEY") {
        v = Number(r.value ?? 0);
      } else {
        const n = extractJsonNumber(r.customData, measureKey!);
        if (n == null) continue;
        v = n;
      }
      const arr = map.get(bk) ?? [];
      arr.push(v);
      map.set(bk, arr);
    }

    let series: { label: string; value: number }[] = [...map.entries()].map(
      ([internalKey, arr]) => {
        let value: number;
        if (spec.dataMeasure === "QUANTITY") {
          value = arr.length;
        } else if (spec.aggregation === "AVG" && arr.length > 0) {
          value = arr.reduce((a, b) => a + b, 0) / arr.length;
        } else {
          value = arr.reduce((a, b) => a + b, 0);
        }
        return {
          label: labelFromInternalBucketKey(internalKey),
          value,
        };
      },
    );

    if (cf.fieldType === "USER") {
      const ids = new Set<string>();
      for (const [internalKey] of map) {
        if (internalKey === EMPTY_BUCKET) continue;
        if (internalKey.startsWith("s:")) ids.add(internalKey.slice(2));
      }
      if (ids.size > 0) {
        const users = await this.prisma.user.findMany({
          where: { tenantId, id: { in: [...ids] } },
          select: { id: true, name: true, email: true },
        });
        const nameById = new Map(
          users.map((u) => {
            const n = u.name?.trim();
            return [u.id, n && n.length > 0 ? n : u.email] as const;
          }),
        );
        series = series.map((s) => {
          if (s.label === "(vazio)") return s;
          const resolved = nameById.get(s.label);
          return resolved ? { ...s, label: resolved } : s;
        });
      }
    }

    return {
      kind: "series",
      series: sortSeriesPtBr(series, ["(vazio)"]),
    };
  }
}
