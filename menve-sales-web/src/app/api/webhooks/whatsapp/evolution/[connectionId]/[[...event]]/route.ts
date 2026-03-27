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
  const requestId = crypto.randomUUID();
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn || conn.provider !== "EVOLUTION") {
    console.warn("[evolution-webhook:not-found]", { requestId, connectionId });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const secret = req.headers.get("x-webhook-secret");
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (expected && secret !== expected) {
    console.warn("[evolution-webhook:unauthorized]", {
      requestId,
      connectionId,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    console.warn("[evolution-webhook:invalid-json]", { requestId, connectionId });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const provider = createWhatsAppProvider(conn);
  const items = provider.parseWebhook(payload);
  let processed = 0;
  let failed = 0;
  let duplicated = 0;

  // Debugging: only log the first few inbounds to avoid noisy logs.
  let debugLimit = 5;
  if (process.env.NODE_ENV === "production") {
    console.warn("[evolution-webhook:config]", {
      requestId,
      allowGroups: process.env.WHATSAPP_ALLOW_GROUPS,
      receivedItems: items.length,
    });
  }

  for (const inbound of items) {
    try {
      const res = await processInboundWhatsApp({
        tenantId: conn.tenantId,
        connectionId: conn.id,
        inbound,
      });
      if ("duplicated" in res && res.duplicated) {
        duplicated += 1;
        continue;
      }
      if (debugLimit > 0 && inbound.debug) {
        debugLimit -= 1;
        console.warn("[evolution-webhook:debug-inbound]", {
          requestId,
          connectionId,
          externalId: inbound.externalId,
          from: inbound.from,
          debug: inbound.debug,
          profileName: inbound.profileName,
          profilePhotoUrl: inbound.profilePhotoUrl
            ? String(inbound.profilePhotoUrl).slice(0, 80)
            : null,
        });
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error("[evolution-webhook:process-error]", {
        requestId,
        connectionId,
        messageExternalId: inbound.externalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.warn("[evolution-webhook:processed]", {
    requestId,
    connectionId,
    received: items.length,
    processed,
    duplicated,
    failed,
  });

  if (failed > 0) {
    return NextResponse.json(
      { ok: false, processed, duplicated, failed },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, processed, duplicated, failed: 0 });
}
