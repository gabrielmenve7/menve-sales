import { Controller, Get, Query } from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("prospecting-funnel")
  prospectingFunnel(
    @ReqUser() u: RequestUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.prospectingFunnel(u.tenantId, from, to);
  }
}
