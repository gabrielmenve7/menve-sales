import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";
import { InboxService } from "./inbox.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("inbox")
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  get(@ReqUser() u: RequestUser) {
    return this.inbox.getInbox(u.tenantId);
  }

  @Post("ensure-conversation")
  ensureConversation(
    @ReqUser() u: RequestUser,
    @Body() body: { contactId?: string },
  ) {
    const contactId = body?.contactId?.trim();
    if (!contactId) {
      throw new BadRequestException("contactId obrigatório");
    }
    return this.inbox.ensureConversationForContact(
      u.tenantId,
      u.userId,
      contactId,
    );
  }
}
