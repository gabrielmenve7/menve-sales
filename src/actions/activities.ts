"use server";

import prisma from "@/lib/prisma";
import { getActiveTenantId, requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ActivityType } from "@prisma/client";
import { z } from "zod";

const activitySchema = z.object({
  title: z.string().min(1),
  type: z.nativeEnum(ActivityType),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  dueAt: z.string().optional(),
  description: z.string().optional(),
});

export async function createActivity(input: z.infer<typeof activitySchema>) {
  const tenantId = await getActiveTenantId();
  const session = await requireSession();
  const data = activitySchema.parse(input);
  await prisma.activity.create({
    data: {
      tenantId,
      userId: session.user.id,
      title: data.title,
      type: data.type,
      contactId: data.contactId,
      dealId: data.dealId,
      description: data.description,
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
    },
  });
  revalidatePath("/activities");
  if (data.contactId) {
    revalidatePath(`/contacts/${data.contactId}`);
  }
}

export async function completeActivity(id: string) {
  const tenantId = await getActiveTenantId();
  const existing = await prisma.activity.findFirst({
    where: { id, tenantId },
    select: { contactId: true },
  });
  await prisma.activity.updateMany({
    where: { id, tenantId },
    data: { completedAt: new Date() },
  });
  revalidatePath("/activities");
  if (existing?.contactId) {
    revalidatePath(`/contacts/${existing.contactId}`);
  }
}
