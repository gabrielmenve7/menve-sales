import { Body, Controller, Param, Post } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conv: ConversationsService) {}

  @Post(":id/notes")
  addNote(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.conv.addNote(u.tenantId, u.userId, id, body);
  }

  @Post(":id/messages")
  sendMessage(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.conv.sendMessage(u.tenantId, u.userId, id, body);
  }
}
