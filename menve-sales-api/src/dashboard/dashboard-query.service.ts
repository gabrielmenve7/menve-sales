import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DealStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { WidgetQuerySpec } from "./dashboard-widget-spec.zod";
import { widgetQuerySpecSchema } from "./dashboard-widget-spec.zod";

export type ScalarResult = { kind: "scalar"; value: number };
export type SeriesResult = {
  kind: "series";
  series: { label: string; value: number }[];
};

@Injectable()
export class DashboardQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(tenantId: string, raw: unknown): Promise<ScalarResult | SeriesResult> {
    const spec = widgetQuerySpecSchema.parse(raw);
    await this.assertPipeline(tenantId, spec.pipelineId);
    return this.runQuery(tenantId, spec);
  }

  async queryBulk(
    tenantId: string,
    specs: unknown[],
  ): Promise<(ScalarResult | SeriesResult)[]> {
    const out: (ScalarResult | SeriesResult)[] = [];
    for (const s of specs) {
      const spec = widgetQuerySpecSchema.parse(s);
      await this.assertPipeline(tenantId, spec.pipelineId);
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

  private statusFilter(spec: WidgetQuerySpec): { in: DealStatus[] } {
    const set = new Set<DealStatus>([DealStatus.OPEN]);
    if (spec.includeClosed) {
      set.add(DealStatus.WON);
      set.add(DealStatus.LOST);
    }
    if (spec.includeArchived) {
      set.add(DealStatus.ARCHIVED);
    }
    return { in: [...set] };
  }

  private baseWhere(tenantId: string, spec: WidgetQuerySpec) {
    return {
      tenantId,
      pipelineId: spec.pipelineId,
      status: this.statusFilter(spec),
    };
  }

  private async runQuery(
    tenantId: string,
    spec: WidgetQuerySpec,
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
    spec: WidgetQuerySpec,
  ): Promise<ScalarResult> {
    const where = this.baseWhere(tenantId, spec);
    if (spec.measure === "COUNT") {
      const value = await this.prisma.deal.count({ where });
      return { kind: "scalar", value };
    }
    const agg = await this.prisma.deal.aggregate({
      where,
      _sum: { value: true },
    });
    return { kind: "scalar", value: Number(agg._sum.value ?? 0) };
  }

  private async byStage(
    tenantId: string,
    spec: WidgetQuerySpec,
  ): Promise<SeriesResult> {
    const where = this.baseWhere(tenantId, spec);
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: spec.pipelineId, tenantId },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pipeline) throw new NotFoundException("Pipeline não encontrado");

    if (spec.measure === "COUNT") {
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

  private async byStatus(
    tenantId: string,
    spec: WidgetQuerySpec,
  ): Promise<SeriesResult> {
    const where = this.baseWhere(tenantId, spec);
    const labels: Record<DealStatus, string> = {
      OPEN: "Aberto",
      WON: "Ganho",
      LOST: "Perdido",
      ARCHIVED: "Arquivado",
    };

    if (spec.measure === "COUNT") {
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

  private async byDay(
    tenantId: string,
    spec: WidgetQuerySpec,
  ): Promise<SeriesResult> {
    const days = spec.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const where = {
      ...this.baseWhere(tenantId, spec),
      createdAt: { gte: since },
    };

    const rows = await this.prisma.deal.findMany({
      where,
      select: { createdAt: true, value: true },
    });

    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.createdAt.toISOString().slice(0, 10);
      if (spec.measure === "COUNT") {
        map.set(key, (map.get(key) ?? 0) + 1);
      } else {
        map.set(key, (map.get(key) ?? 0) + Number(r.value ?? 0));
      }
    }

    const series: { label: string; value: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      series.push({
        label: key,
        value: map.get(key) ?? 0,
      });
    }
    return { kind: "series", series };
  }
}
