import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createWhatsAppProvider } from "@/lib/whatsapp/factory";
import { processInboundWhatsApp } from "@/lib/whatsapp/message-service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-hub-signature-256");
  if (process.env.META_APP_SECRET && !signature) {
    return NextResponse.json({ error: "no_sig" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  const entry = body.entry?.[0];
  const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id as
    | string
    | undefined;

  if (!phoneNumberId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const conn = await prisma.whatsAppConnection.findFirst({
    where: {
      provider: "META",
      isActive: true,
    },
  });

  if (!conn) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const cfg = conn.config as { phoneNumberId?: string };
  if (cfg.phoneNumberId && cfg.phoneNumberId !== phoneNumberId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const provider = createWhatsAppProvider(conn);
  const items = provider.parseWebhook(body);
  for (const inbound of items) {
    await processInboundWhatsApp({
      tenantId: conn.tenantId,
      connectionId: conn.id,
      inbound,
    });
  }

  return NextResponse.json({ ok: true, processed: items.length });
}
