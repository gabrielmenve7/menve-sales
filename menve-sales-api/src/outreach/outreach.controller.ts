import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { OutreachService } from "./outreach.service";

@Controller("outreach")
export class OutreachController {
  constructor(private readonly outreach: OutreachService) {}

  @Get("campaigns")
  listCampaigns(@ReqUser() u: RequestUser) {
    return this.outreach.listCampaigns(u.tenantId);
  }

  @Get("default-template")
  getDefaultTemplate(@ReqUser() u: RequestUser) {
    return this.outreach.getDefaultTemplate(u.tenantId);
  }

  @Post("default-template")
  updateDefaultTemplate(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.outreach.updateDefaultTemplate(u, body);
  }

  @Post("campaigns")
  createCampaign(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.outreach.createCampaign(u, body);
  }

  @Get("campaigns/:id")
  getCampaign(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.outreach.getCampaign(u.tenantId, id);
  }

  @Post("campaigns/:id/start")
  startCampaign(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.outreach.startCampaign(u, id);
  }

  @Post("campaigns/:id/pause")
  pauseCampaign(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.outreach.pauseCampaign(u, id);
  }

  @Get("campaigns/:id/recipients")
  listRecipients(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.outreach.listRecipients(u.tenantId, id);
  }
}
