import { BadRequestException, Injectable } from "@nestjs/common";
import { CustomFieldEntity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { findContactCustomFieldDefinitions } from "./custom-fields-load.util";
import { CUSTOM_FIELD_TYPES_ENUM } from "./custom-field-types";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/i, "Use apenas letras, números e _"),
  fieldType: z.enum(CUSTOM_FIELD_TYPES_ENUM),
  options: z.array(z.string()).optional(),
  entity: z.enum(["CONTACT", "DEAL"]),
  required: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(2000).nullable().optional(),
  fieldType: z.enum(CUSTOM_FIELD_TYPES_ENUM).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)),
  entity: z.enum(["CONTACT", "DEAL"]),
});

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string, entity?: "CONTACT" | "DEAL") {
    if (entity === "CONTACT") {
      return findContactCustomFieldDefinitions(this.prisma, tenantId);
    }
    if (entity === "DEAL") {
      return this.prisma.customField.findMany({
        where: { tenantId, entity: CustomFieldEntity.DEAL },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
    }
    return this.prisma.customField.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async create(u: RequestUser, input: unknown) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const data = createSchema.parse(input);
    if (data.fieldType === "SELECT") {
      const opts = data.options?.filter(Boolean) ?? [];
      if (opts.length === 0) {
        throw new BadRequestException("Campos SELECT precisam de opções");
      }
    }
    let next = 0;
    try {
      const agg = await this.prisma.customField.aggregate({
        where: { tenantId, entity: data.entity },
        _max: { sortOrder: true },
      });
      next = (agg._max.sortOrder ?? -1) + 1;
    } catch {
      const count = await this.prisma.customField.count({ where: { tenantId } });
      next = count;
    }
    try {
      await this.prisma.customField.create({
        data: {
          tenantId,
          name: data.name.trim(),
          description: (() => {
            const t =
              typeof data.description === "string"
                ? data.description.trim()
                : "";
            return t.length > 0 ? t : null;
          })(),
          key: data.key.trim().toLowerCase(),
          fieldType: data.fieldType,
          options:
            data.fieldType === "SELECT" ? (data.options ?? []) : undefined,
          entity: data.entity,
          sortOrder: next,
          required: data.required ?? false,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unknown argument") || msg.includes("entity")) {
        throw new BadRequestException(
          "Esquema do banco desatualizado. Rode prisma migrate deploy.",
        );
      }
      throw e;
    }
  }

  async update(u: RequestUser, input: unknown) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const data = updateSchema.parse(input);
    const existing = await this.prisma.customField.findFirst({
      where: { id: data.id, tenantId },
    });
    if (!existing) throw new BadRequestException("Campo não encontrado");
    const nextType = data.fieldType ?? existing.fieldType;
    if (nextType === "SELECT") {
      const opts =
        data.options !== undefined
          ? data.options.filter(Boolean)
          : Array.isArray(existing.options)
            ? (existing.options as string[])
            : [];
      if (opts.length === 0) {
        throw new BadRequestException("Campos SELECT precisam de opções");
      }
    }
    const optionsPatch: string[] | null | undefined =
      data.options !== undefined
        ? nextType === "SELECT"
          ? data.options
          : null
        : data.fieldType !== undefined && nextType !== "SELECT"
          ? null
          : undefined;
    await this.prisma.customField.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined
          ? {
              description:
                data.description === null
                  ? null
                  : data.description.trim() === ""
                    ? null
                    : data.description.trim(),
            }
          : {}),
        ...(data.fieldType !== undefined ? { fieldType: data.fieldType } : {}),
        ...(optionsPatch !== undefined
          ? {
              options:
                optionsPatch === null
                  ? Prisma.JsonNull
                  : (optionsPatch as Prisma.InputJsonValue),
            }
          : {}),
        ...(data.required !== undefined ? { required: data.required } : {}),
      },
    });
  }

  async delete(u: RequestUser, id: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const row = await this.prisma.customField.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new BadRequestException("Campo não encontrado");
    await this.prisma.customField.delete({ where: { id } });
  }

  async reorder(u: RequestUser, input: unknown) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const { orderedIds, entity } = reorderSchema.parse(input);
    let existing: { id: string }[];
    try {
      existing = await this.prisma.customField.findMany({
        where: { tenantId, entity },
        select: { id: true },
      });
    } catch {
      const all = await this.prisma.customField.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });
      existing = all
        .filter((f) => {
          const ent = (f as { entity?: string | null }).entity;
          if (entity === "CONTACT") {
            return ent == null || ent === "CONTACT";
          }
          return ent === "DEAL";
        })
        .map((f) => ({ id: f.id }));
    }
    const idSet = new Set(existing.map((e) => e.id));
    if (
      orderedIds.length !== existing.length ||
      orderedIds.some((id) => !idSet.has(id))
    ) {
      throw new BadRequestException("Ordem inválida");
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < orderedIds.length; i++) {
          await tx.customField.update({
            where: { id: orderedIds[i] },
            data: { sortOrder: 1000 + i },
          });
        }
        for (let i = 0; i < orderedIds.length; i++) {
          await tx.customField.update({
            where: { id: orderedIds[i] },
            data: { sortOrder: i },
          });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("sortOrder") || msg.includes("Unknown argument")) {
        throw new BadRequestException(
          "Reordenar exige migração aplicada (prisma migrate deploy).",
        );
      }
      throw e;
    }
  }
}
