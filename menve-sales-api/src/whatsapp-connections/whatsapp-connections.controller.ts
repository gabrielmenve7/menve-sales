import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { WhatsappConnectionsService } from "./whatsapp-connections.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("whatsapp-connections")
export class WhatsappConnectionsController {
  constructor(private readonly wa: WhatsappConnectionsService) {}

  @Post("pair")
  pair(@ReqUser() u: RequestUser, @Body() body: { name?: string }) {
    return this.wa.startPairing(u, body);
  }

  @Post("create-meta")
  createMeta(
    @ReqUser() u: RequestUser,
    @Body()
    body: {
      name?: string;
      phoneNumberId: string;
      accessToken: string;
      businessAccountId?: string;
    },
  ) {
    return this.wa.createMetaConnection(u, body);
  }

  @Get("meta-onboarding-info")
  metaOnboarding(@ReqUser() u: RequestUser) {
    return this.wa.getMetaOnboardingInfo(u);
  }

  @Get("meta-embedded-signup-info")
  metaEmbeddedSignup(@ReqUser() u: RequestUser) {
    return this.wa.getMetaEmbeddedSignupInfo(u);
  }

  @Post("meta/oauth-exchange")
  metaOauthExchange(
    @ReqUser() u: RequestUser,
    @Body() body: { code?: string; state?: string },
  ) {
    return this.wa.exchangeMetaOAuthCode(u, body);
  }

  @Post("create-instagram")
  createInstagram(
    @ReqUser() u: RequestUser,
    @Body()
    body: {
      name?: string;
      pageId: string;
      accessToken: string;
      igUserId: string;
    },
  ) {
    return this.wa.createInstagramConnection(u, body);
  }

  @Get(":id/meta-templates")
  metaTemplates(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.wa.listMetaMessageTemplates(u, id);
  }

  @Post(":id/meta-test")
  metaTest(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.wa.testMetaConnection(u, id);
  }

  @Patch(":id/meta")
  patchMeta(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      phoneNumberId?: string;
      accessToken?: string;
      businessAccountId?: string;
    },
  ) {
    return this.wa.patchMetaConnection(u, id, body);
  }

  @Post(":id/refresh-qr")
  refreshQr(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.wa.refreshQr(u, id);
  }

  @Get(":id/status")
  status(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.wa.pollStatus(u, id);
  }

  @Post(":id/reapply-webhook")
  reapply(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.wa.reapplyWebhook(u, id);
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.wa.deleteConnection(u, id);
  }
}
