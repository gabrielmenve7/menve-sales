"use server";

import prisma from "@/lib/prisma";
import {
  assertCanConfigureTenant,
  getActiveTenantId,
} from "@/lib/session";
import { Prisma } from "@prisma/client";
import { findContactCustomFieldDefinitions } from "@/lib/custom-fields-load";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(128),
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/i, "Use apenas letras, números e _"),
  fieldType: z.enum(FIELD_TYPES),
  options: z.array(z.string()).optional(),
  entity: z.enum(["CONTACT", "DEAL"]),
  required: z.boolean().optional(),
});

export async function createCustomField(input: z.infer<typeof createSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = createSchema.parse(input);

  if (data.fieldType === "SELECT") {
    const opts = data.options?.filter(Boolean) ?? [];
    if (opts.length === 0) {
      throw new Error("Campos SELECT precisam de opções");
    }
  }

  let next = 0;
  try {
    const agg = await prisma.customField.aggregate({
      where: { tenantId, entity: data.entity },
      _max: { sortOrder: true },
    });
    next = (agg._max.sortOrder ?? -1) + 1;
  } catch {
    const count = await prisma.customField.count({ where: { tenantId } });
    next = count;
  }

  try {
    await prisma.customField.create({
      data: {
        tenantId,
        name: data.name.trim(),
        key: data.key.trim().toLowerCase(),
        fieldType: data.fieldType,
        options:
          data.fieldType === "SELECT"
            ? (data.options ?? [])
            : undefined,
        entity: data.entity,
        sortOrder: next,
        required: data.required ?? false,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown argument") || msg.includes("entity")) {
      throw new Error(
        "Esquema do banco desatualizado. Rode no projeto: npx prisma migrate deploy && npx prisma generate e reinicie o servidor.",
      );
    }
    throw e;
  }
  revalidatePath("/settings");
  revalidatePath("/contacts");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  fieldType: z.enum(FIELD_TYPES).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export async function updateCustomField(input: z.infer<typeof updateSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = updateSchema.parse(input);

  const existing = await prisma.customField.findFirst({
    where: { id: data.id, tenantId },
  });
  if (!existing) throw new Error("Campo não encontrado");

  const nextType = data.fieldType ?? existing.fieldType;
  if (nextType === "SELECT") {
    const opts =
      data.options !== undefined
        ? data.options.filter(Boolean)
        : Array.isArray(existing.options)
          ? (existing.options as string[])
          : [];
    if (opts.length === 0) {
      throw new Error("Campos SELECT precisam de opções");
    }
  }

  const optionsPatch:
    | string[]
    | null
    | undefined =
    data.options !== undefined
      ? nextType === "SELECT"
        ? data.options
        : null
      : data.fieldType !== undefined && nextType !== "SELECT"
        ? null
        : undefined;

  await prisma.customField.update({
    where: { id: data.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
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
  revalidatePath("/settings");
  revalidatePath("/contacts");
}

export async function deleteCustomField(id: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const row = await prisma.customField.findFirst({
    where: { id, tenantId },
  });
  if (!row) throw new Error("Campo não encontrado");

  await prisma.customField.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/contacts");
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)),
  entity: z.enum(["CONTACT", "DEAL"]),
});

export async function reorderCustomFields(input: z.infer<typeof reorderSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const { orderedIds, entity } = reorderSchema.parse(input);

  let existing: { id: string }[];
  try {
    existing = await prisma.customField.findMany({
      where: { tenantId, entity },
      select: { id: true },
    });
  } catch {
    const all = await prisma.customField.findMany({
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
    throw new Error("Ordem inválida");
  }

  try {
    await prisma.$transaction(async (tx) => {
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
      throw new Error(
        "Reordenar exige migração aplicada. Rode: npx prisma migrate deploy && npx prisma generate",
      );
    }
    throw e;
  }
  revalidatePath("/settings");
}

const updateContactDataSchema = z.object({
  contactId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});

function coerceForField(
  fieldType: string,
  raw: unknown,
  options: unknown,
): unknown {
  if (raw === undefined || raw === null || raw === "") return null;
  switch (fieldType) {
    case "TEXT":
      return String(raw);
    case "NUMBER": {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error("Valor numérico inválido");
      return n;
    }
    case "DATE": {
      const s = String(raw);
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new Error("Data inválida");
      return s;
    }
    case "SELECT": {
      const opts = Array.isArray(options) ? options.map(String) : [];
      const v = String(raw);
      if (!opts.includes(v)) throw new Error("Opção inválida");
      return v;
    }
    default:
      return raw;
  }
}

export async function updateContactCustomData(
  input: z.infer<typeof updateContactDataSchema>,
) {
  const tenantId = await getActiveTenantId();
  const { contactId, values } = updateContactDataSchema.parse(input);

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
  });
  if (!contact) throw new Error("Contato inválido");

  const fields = await findContactCustomFieldDefinitions(tenantId);

  const prev = (contact.customData as Record<string, unknown> | null) ?? {};
  const merged: Record<string, unknown> = { ...prev };

  for (const f of fields) {
    if (!(f.key in values)) continue;
    const raw = values[f.key];
    if (raw === undefined) continue;
    if (raw === null || raw === "") {
      if (f.required) {
        throw new Error(`${f.name} é obrigatório`);
      }
      delete merged[f.key];
      continue;
    }
    try {
      merged[f.key] = coerceForField(f.fieldType, raw, f.options);
    } catch (e) {
      throw new Error(
        e instanceof Error ? `${f.name}: ${e.message}` : String(e),
      );
    }
  }

  for (const f of fields) {
    if (!f.required) continue;
    const v = merged[f.key];
    if (v === undefined || v === null || v === "") {
      throw new Error(`${f.name} é obrigatório`);
    }
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      customData: merged as Prisma.InputJsonValue,
    },
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}
