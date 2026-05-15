import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { z } from "zod";

const collectionIdSchema = z.union([z.string().min(1), z.null()]).optional();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().finite().min(0).max(1e11),
  collectionId: collectionIdSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  price: z.number().finite().min(0).max(1e11).optional(),
  collectionId: collectionIdSchema,
});

export type ProductCollectionSummary = {
  id: string;
  name: string;
};

export type ProductDto = {
  id: string;
  name: string;
  price: number;
  collection: ProductCollectionSummary | null;
  createdAt: string;
  updatedAt: string;
};

type ProductRow = {
  id: string;
  name: string;
  price: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
  collection: { id: string; name: string } | null;
};

function toDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    collection: row.collection
      ? { id: row.collection.id, name: row.collection.name }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lista mínima para selects (sem coleção nem timestamps). */
export type ProductPickerDto = {
  id: string;
  name: string;
  price: number;
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCollectionId(
    tenantId: string,
    collectionId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (collectionId === undefined) return undefined;
    if (collectionId === null) return null;
    const c = await this.prisma.productCollection.findFirst({
      where: { id: collectionId, tenantId },
    });
    if (!c) throw new BadRequestException("Coleção não encontrada");
    return collectionId;
  }

  async list(tenantId: string): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: {
        collection: { select: { id: true, name: true } },
      },
    });
    return rows.map(toDto);
  }

  async listForPicker(tenantId: string): Promise<ProductPickerDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
    }));
  }

  async getById(tenantId: string, id: string): Promise<ProductDto> {
    const row = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        collection: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException("Produto não encontrado");
    return toDto(row);
  }

  async create(tenantId: string, input: unknown): Promise<ProductDto> {
    const data = createSchema.parse(input);
    const name = data.name.trim();
    const resolvedCollectionId = await this.resolveCollectionId(
      tenantId,
      data.collectionId,
    );
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId,
          name,
          price: data.price,
          collectionId:
            resolvedCollectionId === undefined ? null : resolvedCollectionId,
        },
        include: {
          collection: { select: { id: true, name: true } },
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
    const collectionId = await this.resolveCollectionId(
      tenantId,
      data.collectionId,
    );

    try {
      const row = await this.prisma.product.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(data.price !== undefined ? { price: data.price } : {}),
          ...(collectionId !== undefined ? { collectionId } : {}),
        },
        include: {
          collection: { select: { id: true, name: true } },
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
