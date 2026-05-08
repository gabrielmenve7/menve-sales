import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().finite().min(0).max(1e11),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  price: z.number().finite().min(0).max(1e11).optional(),
});

export type ProductDto = {
  id: string;
  name: string;
  price: number;
  createdAt: string;
  updatedAt: string;
};

function toDto(row: {
  id: string;
  name: string;
  price: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
}): ProductDto {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return rows.map(toDto);
  }

  async getById(tenantId: string, id: string): Promise<ProductDto> {
    const row = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Produto não encontrado");
    return toDto(row);
  }

  async create(tenantId: string, input: unknown): Promise<ProductDto> {
    const data = createSchema.parse(input);
    const name = data.name.trim();
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId,
          name,
          price: data.price,
        },
      });
      return toDto(row);
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code)
          : "";
      if (code === "P2002") {
        throw new BadRequestException("Já existe um produto com este nome");
      }
      throw e;
    }
  }

  async update(tenantId: string, id: string, input: unknown): Promise<ProductDto> {
    const data = updateSchema.parse(input);
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Produto não encontrado");

    const name =
      data.name !== undefined ? data.name.trim() : undefined;

    try {
      const row = await this.prisma.product.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(data.price !== undefined ? { price: data.price } : {}),
        },
      });
      return toDto(row);
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code)
          : "";
      if (code === "P2002") {
        throw new BadRequestException("Já existe um produto com este nome");
      }
      throw e;
    }
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Produto não encontrado");
    await this.prisma.product.delete({ where: { id } });
  }
}
