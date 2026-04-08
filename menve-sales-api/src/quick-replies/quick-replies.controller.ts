import { Body, Controller, Delete, Param, Post } from "@nestjs/common";
import { QuickRepliesService } from "./quick-replies.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("quick-replies")
export class QuickRepliesController {
  constructor(private readonly qr: QuickRepliesService) {}

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.qr.create(u.tenantId, body);
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.qr.delete(u.tenantId, id);
  }
}
