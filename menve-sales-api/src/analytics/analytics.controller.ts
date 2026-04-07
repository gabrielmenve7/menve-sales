import { Controller, Get } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@ReqUser() u: RequestUser) {
    return this.analytics.getAnalytics(u.tenantId);
  }
}
