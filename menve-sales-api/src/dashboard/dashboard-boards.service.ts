import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildDefaultSalesBoardLayout,
  DEFAULT_SALES_BOARD_NAME,
} from "./dashboard-default-board.seed";
import {
  EMPTY_LAYOUT,
  layoutJsonSchema,
  type LayoutJson,
} from "./dashboard-layout.zod";

@Injectable()
export class DashboardBoardsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, userId: string) {
    return this.prisma.dashboardBoard.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        layoutJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(tenantId: string, userId: string, name?: string) {
    const n = (name?.trim() || "Novo painel").slice(0, 120);
    return this.prisma.dashboardBoard.create({
      data: {
        tenantId,
        userId,
        name: n,
        layoutJson: EMPTY_LAYOUT as object,
      },
      select: {
        id: true,
        name: true,
        layoutJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    patch: { name?: string; layoutJson?: unknown },
  ) {
    const board = await this.prisma.dashboardBoard.findFirst({
      where: { id, tenantId, userId },
    });
    if (!board) throw new NotFoundException("Painel não encontrado");

    let layout: LayoutJson | undefined;
    if (patch.layoutJson !== undefined) {
      layout = layoutJsonSchema.parse(patch.layoutJson);
    }

    return this.prisma.dashboardBoard.update({
      where: { id },
      data: {
        ...(patch.name !== undefined
          ? { name: patch.name.trim().slice(0, 120) || board.name }
          : {}),
        ...(layout ? { layoutJson: layout as object } : {}),
      },
      select: {
        id: true,
        name: true,
        layoutJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async delete(tenantId: string, userId: string, id: string) {
    const board = await this.prisma.dashboardBoard.findFirst({
      where: { id, tenantId, userId },
    });
    if (!board) throw new NotFoundException("Painel não encontrado");
    await this.prisma.dashboardBoard.delete({ where: { id } });
  }

  async duplicate(tenantId: string, userId: string, id: string) {
    const board = await this.prisma.dashboardBoard.findFirst({
      where: { id, tenantId, userId },
    });
    if (!board) throw new NotFoundException("Painel não encontrado");

    const layout = layoutJsonSchema.parse(board.layoutJson);
    const copyName = `Cópia de ${board.name}`.slice(0, 120);

    return this.prisma.dashboardBoard.create({
      data: {
        tenantId,
        userId,
        name: copyName,
        layoutJson: layout as object,
      },
      select: {
        id: true,
        name: true,
        layoutJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Cria (ou reutiliza) o painel "Vendas — Visão geral" com layout KPI + gráficos.
   * - `force: true` — sempre cria um novo painel com esse layout.
   * - `onlyIfEmpty: true` e sem `force` — só cria se o utilizador ainda não tiver nenhum painel.
   * - Caso contrário — devolve um painel existente com o nome canónico, se houver; senão cria.
   */
  async seedDefault(
    tenantId: string,
    userId: string,
    options?: { force?: boolean; onlyIfEmpty?: boolean },
  ) {
    const force = options?.force === true;
    const onlyIfEmpty = options?.onlyIfEmpty === true;

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true },
    });
    if (!pipeline) return null;

    const layout = layoutJsonSchema.parse(
      buildDefaultSalesBoardLayout(pipeline.id),
    );

    if (onlyIfEmpty && !force) {
      const n = await this.prisma.dashboardBoard.count({
        where: { tenantId, userId },
      });
      if (n > 0) return null;
    }

    if (!force) {
      const existing = await this.prisma.dashboardBoard.findFirst({
        where: { tenantId, userId, name: DEFAULT_SALES_BOARD_NAME },
        select: {
          id: true,
          name: true,
          layoutJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (existing) return existing;
    }

    return this.prisma.dashboardBoard.create({
      data: {
        tenantId,
        userId,
        name: DEFAULT_SALES_BOARD_NAME,
        layoutJson: layout as object,
      },
      select: {
        id: true,
        name: true,
        layoutJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
