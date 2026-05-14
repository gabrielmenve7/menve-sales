import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export type ProductCollectionDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function toDto(row: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): ProductCollectionDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProductCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ProductCollectionDto[]> {
    const rows = await this.prisma.productCollection.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return rows.map(toDto);
  }

  async create(tenantId: string, input: unknown): Promise<ProductCollectionDto> {
    const data = createSchema.parse(input);
    const name = data.name.trim();
    try {
      const row = await this.prisma.productCollection.create({
        data: { tenantId, name },
      });
      return toDto(row);
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code)
          : "";
      if (code === "P2002") {
        throw new BadRequestException("Já existe uma coleção com este nome");
      }
      throw e;
    }
  }

  async update(
    tenantId: string,
    id: string,
    input: unknown,
  ): Promise<ProductCollectionDto> {
    const data = updateSchema.parse(input);
    const existing = await this.prisma.productCollection.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Coleção não encontrada");

    const name = data.name !== undefined ? data.name.trim() : undefined;

    try {
      const row = await this.prisma.productCollection.update({
        where: { id },
        data: name !== undefined ? { name } : {},
      });
      return toDto(row);
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code)
          : "";
      if (code === "P2002") {
        throw new BadRequestException("Já existe uma coleção com este nome");
      }
      throw e;
    }
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.productCollection.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Coleção não encontrada");
    await this.prisma.productCollection.delete({ where: { id } });
  }
}
