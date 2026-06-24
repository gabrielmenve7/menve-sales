import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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

  @Get("conversations/:conversationId/messages")
  listOlderMessages(
    @ReqUser() u: RequestUser,
    @Param("conversationId") conversationId: string,
    @Query("before") before: string,
  ) {
    const b = before?.trim();
    if (!b) {
      throw new BadRequestException("Query before (id da mensagem) é obrigatória");
    }
    return this.inbox.listMessagesBefore(u.tenantId, conversationId, b);
  }

  @Get("conversations/:conversationId")
  getConversation(
    @ReqUser() u: RequestUser,
    @Param("conversationId") conversationId: string,
  ) {
    return this.inbox.getConversationForInbox(u.tenantId, conversationId);
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

  @Delete("conversations/:conversationId")
  deleteConversation(
    @ReqUser() u: RequestUser,
    @Param("conversationId") conversationId: string,
  ) {
    return this.inbox.deleteConversation(u.tenantId, conversationId);
  }
}
