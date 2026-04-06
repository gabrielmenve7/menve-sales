"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

export async function sendWhatsAppMessage(input: {
  conversationId: string;
  connectionId: string;
  toPhone: string;
  text: string;
}) {
  await apiServer(`/conversations/${input.conversationId}/messages`, {
    method: "POST",
    json: {
      connectionId: input.connectionId,
      toPhone: input.toPhone,
      text: input.text,
    },
  });
  revalidatePath("/inbox");
  revalidatePath("/contacts", "layout");
}

export async function sendWhatsAppMediaMessage(input: {
  conversationId: string;
  connectionId: string;
  toPhone: string;
  mediaKind: "audio" | "image" | "document";
  mediaDataUrl: string;
  fileName?: string;
  caption?: string;
}) {
  await apiServer(`/conversations/${input.conversationId}/messages`, {
    method: "POST",
    json: {
      connectionId: input.connectionId,
      toPhone: input.toPhone,
      mediaKind: input.mediaKind,
      mediaDataUrl: input.mediaDataUrl,
      fileName: input.fileName,
      caption: input.caption,
    },
  });
  revalidatePath("/inbox");
  revalidatePath("/contacts", "layout");
}
