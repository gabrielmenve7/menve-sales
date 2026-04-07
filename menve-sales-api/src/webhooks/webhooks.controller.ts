import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/public.decorator";
import { createWhatsAppProvider } from "../whatsapp/factory";
import { getEvolutionWebhookParseMeta } from "../whatsapp/evolution-provider";
import { MessageProcessingService } from "../whatsapp/message-processing.service";

@Controller("webhooks/whatsapp")
export class WebhooksController {
  private readonly log = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessageProcessingService,
  ) {}

  @Public()
  @Get("meta")
  verifyMeta(@Req() req: Request, @Res() res: Response) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (
      mode === "subscribe" &&
      token === process.env.META_VERIFY_TOKEN &&
      typeof challenge === "string"
    ) {
      return res.status(200).type("text/plain").send(challenge);
    }
    return res.status(403).json({ error: "forbidden" });
  }

  @Public()
  @Post("meta")
  async metaWebhook(@Req() req: Request, @Body() body: unknown) {
    const signature = req.headers["x-hub-signature-256"];
    if (process.env.META_APP_SECRET && !signature) {
      throw new HttpException("no_sig", HttpStatus.UNAUTHORIZED);
    }
    if (!body || typeof body !== "object") {
      throw new HttpException({ ok: false }, HttpStatus.BAD_REQUEST);
    }
    const b = body as {
      entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[];
    };
    const phoneNumberId = b.entry?.[0]?.changes?.[0]?.value?.metadata
      ?.phone_number_id;
    if (!phoneNumberId) {
      return { ok: true, skipped: true };
    }
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { provider: "META", isActive: true },
    });
    if (!conn) return { ok: true, skipped: true };
    const cfg = conn.config as { phoneNumberId?: string };
    if (cfg.phoneNumberId && cfg.phoneNumberId !== phoneNumberId) {
      return { ok: true, skipped: true };
    }
    const provider = createWhatsAppProvider(conn);
    const items = provider.parseWebhook(body);
    for (const inbound of items) {
      await this.messages.processInboundWhatsApp({
        tenantId: conn.tenantId,
        connectionId: conn.id,
        inbound,
      });
    }
    return { ok: true, processed: items.length };
  }

  @Public()
  @Post("evolution/:connectionId")
  async evolutionWebhook(
    @Param("connectionId") connectionId: string,
    @Req() req: Request,
    @Body() payload: unknown,
  ) {
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn || conn.provider !== "EVOLUTION") {
      throw new HttpException({ error: "not_found" }, HttpStatus.NOT_FOUND);
    }
    const secret = req.headers["x-webhook-secret"];
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (expected && secret !== expected) {
      throw new HttpException({ error: "unauthorized" }, HttpStatus.UNAUTHORIZED);
    }
    if (payload == null || typeof payload !== "object") {
      throw new HttpException({ ok: false }, HttpStatus.BAD_REQUEST);
    }
    const raw = payload as Record<string, unknown>;
    const evNorm = String(raw.event ?? "")
      .trim()
      .replace(/[.-]/g, "_")
      .toUpperCase();
    if (evNorm === "MESSAGES_UPDATE") {
      const ackUpdated = await this.messages.processEvolutionMessageAckUpdates({
        tenantId: conn.tenantId,
        connectionId: conn.id,
        payload: raw,
      });
      this.log.log(
        `evolution webhook connectionId=${connectionId} event=MESSAGES_UPDATE ackUpdated=${ackUpdated}`,
      );
      return {
        ok: true,
        processed: 0,
        duplicated: 0,
        failed: 0,
        event: raw.event,
        blobs: 0,
        ackUpdated,
      };
    }
    const provider = createWhatsAppProvider(conn);
    const items = provider.parseWebhook(payload);
    let processed = 0;
    let failed = 0;
    let duplicated = 0;
    for (const inbound of items) {
      try {
        const res = await this.messages.processInboundWhatsApp({
          tenantId: conn.tenantId,
          connectionId: conn.id,
          inbound,
        });
        if ("duplicated" in res && res.duplicated) {
          duplicated += 1;
          continue;
        }
        processed += 1;
      } catch (e) {
        failed += 1;
        this.log.error(
          `evolution inbound falhou connectionId=${connectionId} externalId=${inbound.externalId}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
    if (failed > 0) {
      throw new HttpException(
        { ok: false, processed, duplicated, failed },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const meta = getEvolutionWebhookParseMeta(payload);
    // Sempre logar: com "sem erro" no UI mas inbox vazio, aqui mostra se chegou mensagem e se gravou.
    this.log.log(
      `evolution webhook connectionId=${connectionId} event=${String(meta.event)} blobs=${meta.blobCount} parsed=${items.length} processed=${processed} duplicated=${duplicated}`,
    );
    if (items.length === 0 && meta.blobCount > 0) {
      this.log.warn(
        `evolution webhook: ${meta.blobCount} blob(s) mas nenhuma mensagem inbound (fromMe, grupo, JID não suportado ou sem texto). connectionId=${connectionId}`,
      );
    }
    if (processed === 0 && meta.blobCount === 0 && typeof meta.event === "string") {
      const ev = String(meta.event).trim().replace(/[.-]/g, "_").toUpperCase();
      if (ev === "MESSAGES_UPSERT") {
        this.log.warn(
          `evolution webhook: evento MESSAGES_UPSERT sem campo data reconhecível. connectionId=${connectionId}`,
        );
      }
    }
    return {
      ok: true,
      processed,
      duplicated,
      failed: 0,
      event: meta.event,
      blobs: meta.blobCount,
    };
  }
}
