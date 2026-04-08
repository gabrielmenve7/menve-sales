import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DealStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isoRangeFromRollingPreset,
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

function startOfDayUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function endOfDayUtc(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

/** Último instante (UTC) do último dia do mês civil que contém `isoYmd` (YYYY-MM-DD). */
function endOfMonthContainingUtc(isoYmd: string): Date {
  const y = Number(isoYmd.slice(0, 4));
  const mo = Number(isoYmd.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    const d = new Date();
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }
  return new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999));
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

@Injectable()
export class DashboardQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(tenantId: string, raw: unknown): Promise<ScalarResult | SeriesResult> {
    const input = widgetQuerySpecSchema.parse(raw);
    const spec = resolveWidgetQuerySpec(input);
    await this.assertPipeline(tenantId, spec.pipelineId);
    await this.assertCustomFieldIfNeeded(tenantId, spec);
    return this.runQuery(tenantId, spec);
  }

  async queryBulk(
    tenantId: string,
    specs: unknown[],
  ): Promise<(ScalarResult | SeriesResult)[]> {
    const out: (ScalarResult | SeriesResult)[] = [];
    for (const s of specs) {
      const input = widgetQuerySpecSchema.parse(s);
      const spec = resolveWidgetQuerySpec(input);
      await this.assertPipeline(tenantId, spec.pipelineId);
      await this.assertCustomFieldIfNeeded(tenantId, spec);
      out.push(await this.runQuery(tenantId, spec));
    }
    return out;
  }

  private async assertPipeline(tenantId: string, pipelineId: string) {
    const p = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException("Pipeline não encontrado");
  }

  /** Garante que a chave existe e é numérica (NUMBER ou MONEY_BRL) no deal. */
  private async assertCustomFieldIfNeeded(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ) {
    if (spec.dataMeasure !== "CUSTOM_NUMBER" || !spec.customFieldKey) return;
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

  private buildWhere(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Prisma.DealWhereInput {
    const and: Prisma.DealWhereInput[] = [{ tenantId }, { pipelineId: spec.pipelineId }];

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
        return { status: { in: codes as DealStatus[] } };
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
                lte: dt,
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
              { customData: { path: [k], lte: range.to } },
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
  ): Promise<ScalarResult | SeriesResult> {
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
    throw new BadRequestException("Dimensão inválida");
  }

  private async scalar(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<ScalarResult> {
    const where = this.buildWhere(tenantId, spec);
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

  private async byDay(
    tenantId: string,
    spec: ResolvedWidgetQuerySpec,
  ): Promise<SeriesResult> {
    const baseWhere = this.buildWhere(tenantId, spec);

    let since: Date;
    let dateKeys: string[];

    if (spec.timelineStart?.trim()) {
      const startKey = spec.timelineStart.trim();
      since = startOfDayUtc(startKey);
      const end =
        spec.fillTimelineMonth === true
          ? endOfMonthContainingUtc(startKey)
          : (() => {
              const t = new Date();
              t.setUTCHours(23, 59, 59, 999);
              return t;
            })();
      dateKeys = [];
      for (
        let d = new Date(since.getTime());
        d.getTime() <= end.getTime();
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        dateKeys.push(d.toISOString().slice(0, 10));
        if (dateKeys.length > 366) break;
      }
    } else {
      const days = Math.min(366, Math.max(1, spec.days ?? 30));
      const rollingSince = new Date();
      rollingSince.setDate(rollingSince.getDate() - days);
      rollingSince.setUTCHours(0, 0, 0, 0);
      since = rollingSince;
      dateKeys = [];
      for (let i = days - 1; i >= 0; i--) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        dateKeys.push(dt.toISOString().slice(0, 10));
      }
    }

    const where: Prisma.DealWhereInput = {
      AND: [baseWhere, { createdAt: { gte: since } }],
    };

    const rows = await this.prisma.deal.findMany({
      where,
      select: { createdAt: true, value: true, customData: true },
    });

    const key = spec.customFieldKey;
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const dkey = r.createdAt.toISOString().slice(0, 10);
      let v: number;
      if (spec.dataMeasure === "QUANTITY") {
        v = 1;
      } else if (spec.dataMeasure === "MONEY") {
        v = Number(r.value ?? 0);
      } else {
        const n = extractJsonNumber(r.customData, key!);
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
}
