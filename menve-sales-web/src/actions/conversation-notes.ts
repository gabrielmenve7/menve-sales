"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const noteSchema = z.object({
  conversationId: z.string(),
  body: z.string().min(1).max(4000),
});

export async function addConversationNote(input: z.infer<typeof noteSchema>) {
  const data = noteSchema.parse(input);
  await apiServer(`/conversations/${data.conversationId}/notes`, {
    method: "POST",
    json: { body: data.body.trim() },
  });
  revalidatePath("/inbox");
}
