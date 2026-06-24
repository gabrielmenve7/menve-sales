import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  OutreachCampaignStatus,
  OutreachRecipientStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutreachService } from "./outreach.service";

const TICK_MS = 30_000;

@Injectable()
export class OutreachWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutreachWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly lastSendByTenant = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        this.log.error(
          "tick failed",
          err instanceof Error ? err.message : String(err),
        );
      });
    }, TICK_MS);
    this.log.log(`Outreach worker started (interval ${TICK_MS}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const campaigns = await this.prisma.outreachCampaign.findMany({
        where: { status: OutreachCampaignStatus.RUNNING },
        include: {
          tenant: { select: { outreachThrottleSeconds: true } },
          connection: true,
        },
      });
      if (campaigns.length === 0) return;

      const byTenant = new Map<string, typeof campaigns>();
      for (const c of campaigns) {
        const list = byTenant.get(c.tenantId) ?? [];
        list.push(c);
        byTenant.set(c.tenantId, list);
      }

      for (const [tenantId, tenantCampaigns] of byTenant) {
        const throttleSec =
          tenantCampaigns[0]?.tenant.outreachThrottleSeconds ?? 45;
        const last = this.lastSendByTenant.get(tenantId) ?? 0;
        if (Date.now() - last < throttleSec * 1000) continue;

        const campaignIds = tenantCampaigns.map((c) => c.id);
        const recipient =
          await this.prisma.outreachCampaignRecipient.findFirst({
            where: {
              campaignId: { in: campaignIds },
              status: OutreachRecipientStatus.PENDING,
              OR: [
                { nextSendAt: null },
                { nextSendAt: { lte: new Date() } },
              ],
            },
            orderBy: { createdAt: "asc" },
          });
        if (!recipient) {
          for (const c of tenantCampaigns) {
            await this.outreach.maybeCompleteCampaign(c.id);
          }
          continue;
        }

        const campaign = tenantCampaigns.find(
          (c) => c.id === recipient.campaignId,
        );
        if (!campaign) continue;

        if (!campaign.connection.isActive) {
          this.log.warn(
            `Skipping campaign ${campaign.id}: connection inactive`,
          );
          continue;
        }

        const result = await this.outreach.sendToRecipient({
          campaign,
          recipientId: recipient.id,
          userId: campaign.createdById,
        });

        if (result.sent) {
          this.lastSendByTenant.set(tenantId, Date.now());
          await this.outreach.maybeCompleteCampaign(campaign.id);
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
