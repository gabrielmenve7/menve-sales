"use server";

import prisma from "@/lib/prisma";
import { getActiveTenantId, requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const noteSchema = z.object({
  conversationId: z.string(),
  body: z.string().min(1).max(4000),
});

export async function addConversationNote(input: z.infer<typeof noteSchema>) {
  const tenantId = await getActiveTenantId();
  const session = await requireSession();
  const data = noteSchema.parse(input);

  const conv = await prisma.conversation.findFirst({
    where: { id: data.conversationId, tenantId },
  });
  if (!conv) throw new Error("Conversa não encontrada");

  await prisma.internalNote.create({
    data: {
      conversationId: data.conversationId,
      userId: session.user.id,
      body: data.body.trim(),
    },
  });
  revalidatePath("/inbox");
}
