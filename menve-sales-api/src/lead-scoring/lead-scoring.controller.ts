import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { LeadScoringService } from "./lead-scoring.service";

@Controller("lead-scoring")
export class LeadScoringController {
  constructor(private readonly leadScoring: LeadScoringService) {}

  @Get("rules")
  getRules(@ReqUser() u: RequestUser) {
    return this.leadScoring.getRules(u.tenantId);
  }

  @Put("rules")
  putRules(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.leadScoring.putRules(u, body);
  }

  @Post("recalculate")
  recalculate(@ReqUser() u: RequestUser) {
    return this.leadScoring.recalculate(u.tenantId);
  }
}
