"use server";

import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const qrSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
});

export async function createQuickReply(input: z.infer<typeof qrSchema>) {
  const tenantId = await getActiveTenantId();
  const data = qrSchema.parse(input);
  const last = await prisma.quickReply.findFirst({
    where: { tenantId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.quickReply.create({
    data: {
      tenantId,
      title: data.title.trim(),
      body: data.body.trim(),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

export async function deleteQuickReply(id: string) {
  const tenantId = await getActiveTenantId();
  await prisma.quickReply.deleteMany({ where: { id, tenantId } });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}
