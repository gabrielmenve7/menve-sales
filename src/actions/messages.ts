"use server";

import { sendOutboundText } from "@/lib/whatsapp/message-service";
import { getActiveTenantId, requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function sendWhatsAppMessage(input: {
  connectionId: string;
  toPhone: string;
  text: string;
}) {
  const tenantId = await getActiveTenantId();
  const session = await requireSession();
  await sendOutboundText({
    tenantId,
    connectionId: input.connectionId,
    userId: session.user.id,
    toPhone: input.toPhone,
    text: input.text,
  });
  revalidatePath("/inbox");
  revalidatePath("/contacts", "layout");
}
