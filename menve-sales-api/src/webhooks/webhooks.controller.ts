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
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/public.decorator";
import { createWhatsAppProvider } from "../whatsapp/factory";
import { getEvolutionWebhookParseMeta } from "../whatsapp/evolution-provider";
import {
  getZappfyWebhookBlobKeys,
  getZappfyWebhookInboxSample,
  getZappfyWebhookParseMeta,
} from "../whatsapp/zappfy-provider";
import { MessageProcessingService } from "../whatsapp/message-processing.service";
import { verifyMetaHubSignature256 } from "./meta-signature";

@SkipThrottle()
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
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (appSecret) {
      if (!signature) {
        throw new HttpException("no_sig", HttpStatus.UNAUTHORIZED);
      }
      const raw = req.rawBody;
      if (!raw?.length) {
        this.log.warn(
          "meta webhook: META_APP_SECRET definido mas rawBody ausente; verifique middleware json.verify em main.ts",
        );
        throw new HttpException("no_raw_body", HttpStatus.UNAUTHORIZED);
      }
      if (!verifyMetaHubSignature256(raw, signature, appSecret)) {
        throw new HttpException("bad_sig", HttpStatus.FORBIDDEN);
      }
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
      return { ok: true, skipped: true, reason: "no_phone_number_id" };
    }
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: {
        provider: "META",
        isActive: true,
        config: {
          path: ["phoneNumberId"],
          equals: phoneNumberId,
        },
      },
    });
    if (!conn) {
      this.log.warn(
        `meta webhook: nenhuma conexão META para phone_number_id=${phoneNumberId}`,
      );
      return { ok: true, skipped: true, reason: "unknown_phone_number_id" };
    }
    const provider = createWhatsAppProvider(conn);
    const items = provider.parseWebhook(body);
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
          `meta inbound falhou connectionId=${conn.id} externalId=${inbound.externalId}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
    this.log.log(
      `meta webhook connectionId=${conn.id} phoneNumberId=${phoneNumberId} parsed=${items.length} processed=${processed} duplicated=${duplicated} failed=${failed}`,
    );
    if (failed > 0) {
      throw new HttpException(
        { ok: false, processed, duplicated, failed },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { ok: true, processed, duplicated, failed: 0 };
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

  @Public()
  @Post("zappfy/:connectionId")
  async zappfyWebhook(
    @Param("connectionId") connectionId: string,
    @Req() req: Request,
    @Body() payload: unknown,
  ) {
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
    });
    if (!conn || conn.provider !== "ZAPPFY") {
      throw new HttpException({ error: "not_found" }, HttpStatus.NOT_FOUND);
    }
    const headerSecret = req.headers["x-webhook-secret"];
    const querySecret = req.query["webhook_secret"];
    const secret =
      (typeof headerSecret === "string" ? headerSecret : undefined) ??
      (typeof querySecret === "string" ? querySecret : undefined);
    const expected = process.env.ZAPPFY_WEBHOOK_SECRET?.trim();
    if (expected && secret !== expected) {
      this.log.warn(
        `zappfy webhook 401 connectionId=${connectionId} tenantId=${conn.tenantId} (secret ausente ou inválido — use header x-webhook-secret ou ?webhook_secret= na URL registrada; reaplique webhook no Menve)`,
      );
      await this.touchWebhookAuthFailure(conn.id);
      throw new HttpException({ error: "unauthorized" }, HttpStatus.UNAUTHORIZED);
    }
    if (payload == null || typeof payload !== "object") {
      throw new HttpException({ ok: false }, HttpStatus.BAD_REQUEST);
    }
    const inboxSample = getZappfyWebhookInboxSample(payload);
    this.log.log(
      `zappfy webhook recv tenantId=${conn.tenantId} connectionId=${connectionId} event=${String(inboxSample.event ?? "—")} hasKey=${inboxSample.hasDataKey} fromMe=${String(inboxSample.fromMe ?? "—")} remoteJid=${inboxSample.remoteJid ?? "—"}`,
    );
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
          `zappfy inbound falhou tenantId=${conn.tenantId} connectionId=${connectionId} externalId=${inbound.externalId}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
    await this.touchWebhookMeta(conn.id, {
      parsed: items.length,
      blobs: getZappfyWebhookParseMeta(payload).blobCount,
      processed,
      event: inboxSample.event,
      fromMe: inboxSample.fromMe,
      remoteJid: inboxSample.remoteJid,
    });
    if (failed > 0) {
      throw new HttpException(
        { ok: false, processed, duplicated, failed },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const meta = getZappfyWebhookParseMeta(payload);
    this.log.log(
      `zappfy webhook tenantId=${conn.tenantId} connectionId=${connectionId} event=${String(meta.event)} blobs=${meta.blobCount} parsed=${items.length} processed=${processed} duplicated=${duplicated}`,
    );
    if (items.length === 0 && meta.blobCount > 0) {
      const blobKeys = getZappfyWebhookBlobKeys(payload);
      this.log.warn(
        `zappfy webhook: ${meta.blobCount} blob(s) mas nenhuma mensagem inbound (${meta.rejectReason ?? "motivo desconhecido"}). tenantId=${conn.tenantId} connectionId=${connectionId} blobKeys=${blobKeys}`,
      );
    } else if (items.length === 0 && meta.rejectReason) {
      this.log.warn(
        `zappfy webhook ignorado: ${meta.rejectReason}. tenantId=${conn.tenantId} connectionId=${connectionId}`,
      );
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

  private async touchWebhookAuthFailure(connectionId: string) {
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { config: true },
    });
    if (!conn) return;
    const cfg = (conn.config as Record<string, unknown>) ?? {};
    await this.prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: {
        config: {
          ...cfg,
          lastWebhookAuthFailedAt: new Date().toISOString(),
        },
      },
    });
  }

  private async touchWebhookMeta(
    connectionId: string,
    meta: {
      parsed: number;
      blobs: number;
      processed: number;
      event?: unknown;
      fromMe?: unknown;
      remoteJid?: string | null;
    },
  ) {
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { config: true },
    });
    if (!conn) return;
    const cfg = (conn.config as Record<string, unknown>) ?? {};
    await this.prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: {
        config: {
          ...cfg,
          lastWebhookAt: new Date().toISOString(),
          lastWebhookParsed: meta.parsed,
          lastWebhookBlobs: meta.blobs,
          lastWebhookProcessed: meta.processed,
          ...(meta.event !== undefined
            ? { lastWebhookEvent: String(meta.event) }
            : {}),
          ...(meta.fromMe !== undefined
            ? { lastWebhookFromMe: meta.fromMe === true }
            : {}),
          ...(meta.remoteJid != null
            ? { lastWebhookRemoteJid: meta.remoteJid }
            : {}),
        },
      },
    });
  }
}
