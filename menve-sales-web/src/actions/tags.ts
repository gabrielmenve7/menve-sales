"use server";

import prisma from "@/lib/prisma";
import {
  assertCanConfigureTenant,
  getActiveTenantId,
} from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const tagNameSchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().max(32).optional(),
});

export async function createTag(input: z.infer<typeof tagNameSchema>) {
  const tenantId = await getActiveTenantId();
  const data = tagNameSchema.parse(input);
  const name = data.name.trim();
  await prisma.tag.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: {
      tenantId,
      name,
      color: data.color || null,
    },
    update: {
      color: data.color ?? undefined,
    },
  });
  revalidatePath("/contacts");
  revalidatePath("/settings");
}

/** Criação de tag a partir de Configurações (apenas OWNER/ADMIN/MANAGER/SUPER_ADMIN). */
export async function createCatalogTag(input: z.infer<typeof tagNameSchema>) {
  await assertCanConfigureTenant();
  await createTag(input);
}

const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64).optional(),
  color: z.string().max(32).nullable().optional(),
});

export async function updateTag(input: z.infer<typeof updateTagSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = updateTagSchema.parse(input);

  const existing = await prisma.tag.findFirst({
    where: { id: data.id, tenantId },
  });
  if (!existing) throw new Error("Tag não encontrada");

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    const clash = await prisma.tag.findFirst({
      where: {
        tenantId,
        name: trimmed,
        NOT: { id: data.id },
      },
    });
    if (clash) throw new Error("Já existe uma tag com este nome");
  }

  await prisma.tag.update({
    where: { id: data.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });
  revalidatePath("/contacts");
  revalidatePath("/settings");
}

export async function deleteTag(tagId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, tenantId },
  });
  if (!tag) throw new Error("Tag não encontrada");

  await prisma.$transaction([
    prisma.contactTag.deleteMany({ where: { tagId } }),
    prisma.dealTag.deleteMany({ where: { tagId } }),
    prisma.tag.delete({ where: { id: tagId } }),
  ]);
  revalidatePath("/contacts");
  revalidatePath("/settings");
}

export async function addTagToContact(contactId: string, tagId: string) {
  const tenantId = await getActiveTenantId();
  const [contact, tag] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, tenantId } }),
    prisma.tag.findFirst({ where: { id: tagId, tenantId } }),
  ]);
  if (!contact || !tag) throw new Error("Contato ou tag inválidos");

  await prisma.contactTag.upsert({
    where: {
      contactId_tagId: { contactId, tagId },
    },
    create: { contactId, tagId },
    update: {},
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const tenantId = await getActiveTenantId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
  });
  if (!contact) throw new Error("Contato inválido");

  await prisma.contactTag.deleteMany({
    where: { contactId, tagId },
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}
