import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
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
}
