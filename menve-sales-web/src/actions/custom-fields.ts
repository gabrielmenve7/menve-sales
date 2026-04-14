"use server";

import type { CustomField } from "@prisma/client";
import { apiServer } from "@/lib/api-server";
import { CUSTOM_FIELD_TYPE_ZOD_ENUM } from "@/lib/custom-field-types";
import { assertCanConfigureTenant } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function listCustomFieldsForEntity(
  entity: "CONTACT" | "DEAL",
): Promise<CustomField[]> {
  try {
    const raw = await apiServer<unknown>(
      `/custom-fields?entity=${encodeURIComponent(entity)}`,
    );
    return Array.isArray(raw) ? (raw as CustomField[]) : [];
  } catch {
    return [];
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/i, "Use apenas letras, números e _"),
  fieldType: z.enum(CUSTOM_FIELD_TYPE_ZOD_ENUM),
  options: z.array(z.string()).optional(),
  entity: z.enum(["CONTACT", "DEAL"]),
  required: z.boolean().optional(),
});

export async function createCustomField(input: z.infer<typeof createSchema>) {
  await assertCanConfigureTenant();
  const data = createSchema.parse(input);

  if (data.fieldType === "SELECT") {
    const opts = data.options?.filter(Boolean) ?? [];
    if (opts.length === 0) {
      throw new Error("Campos SELECT precisam de opções");
    }
  }

  await apiServer("/custom-fields", {
    method: "POST",
    json: {
      name: data.name.trim(),
      ...(data.description?.trim()
        ? { description: data.description.trim() }
        : {}),
      key: data.key.trim().toLowerCase(),
      fieldType: data.fieldType,
      options: data.fieldType === "SELECT" ? (data.options ?? []) : undefined,
      entity: data.entity,
      required: data.required ?? false,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(2000).nullable().optional(),
  fieldType: z.enum(CUSTOM_FIELD_TYPE_ZOD_ENUM).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export async function updateCustomField(input: z.infer<typeof updateSchema>) {
  await assertCanConfigureTenant();
  const data = updateSchema.parse(input);
  await apiServer(`/custom-fields/${data.id}`, {
    method: "PUT",
    json: {
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
      ...(data.options !== undefined ? { options: data.options } : {}),
      ...(data.required !== undefined ? { required: data.required } : {}),
    },
  });
  revalidatePath("/settings");
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
}

export async function deleteCustomField(id: string) {
  await assertCanConfigureTenant();
  await apiServer(`/custom-fields/${id}`, { method: "DELETE" });
  revalidatePath("/settings");
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)),
  entity: z.enum(["CONTACT", "DEAL"]),
});

export async function reorderCustomFields(input: z.infer<typeof reorderSchema>) {
  await assertCanConfigureTenant();
  const body = reorderSchema.parse(input);
  await apiServer("/custom-fields/reorder", {
    method: "PATCH",
    json: body,
  });
  revalidatePath("/settings");
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
}

const updateContactDataSchema = z.object({
  contactId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});

export async function updateContactCustomData(
  input: z.infer<typeof updateContactDataSchema>,
) {
  const { contactId, values } = updateContactDataSchema.parse(input);
  await apiServer(`/contacts/${contactId}/custom-data`, {
    method: "PATCH",
    json: { values },
  });
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
  revalidatePath(`/contacts/${contactId}`, "page");
}

const updateDealDataSchema = z.object({
  dealId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});

export async function updateDealCustomData(
  input: z.infer<typeof updateDealDataSchema>,
) {
  const { dealId, values } = updateDealDataSchema.parse(input);
  await apiServer(`/deals/${dealId}/custom-data`, {
    method: "PATCH",
    json: { values },
  });
  revalidatePath("/pipeline", "page");
  revalidatePath("/inbox", "page");
}
