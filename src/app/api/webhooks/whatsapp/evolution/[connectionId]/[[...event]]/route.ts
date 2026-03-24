import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createWhatsAppProvider } from "@/lib/whatsapp/factory";
import { processInboundWhatsApp } from "@/lib/whatsapp/message-service";

/**
 * Evolution com `webhookByEvents: true` envia para .../connectionId/messages-upsert etc.
 * Com URL única (`webhookByEvents: false`) o POST vai para .../connectionId.
 * Este segmento opcional [[...event]] cobre os dois casos.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ connectionId: string; event?: string[] }> },
) {
  const { connectionId } = await ctx.params;
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || conn.provider !== "EVOLUTION") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const secret = req.headers.get("x-webhook-secret");
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false }, { status: 400 });

  const provider = createWhatsAppProvider(conn);
  const items = provider.parseWebhook(payload);
  for (const inbound of items) {
    await processInboundWhatsApp({
      tenantId: conn.tenantId,
      connectionId: conn.id,
      inbound,
    });
  }

  return NextResponse.json({ ok: true, processed: items.length });
}
