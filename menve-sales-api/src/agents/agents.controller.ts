import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get("larissa")
  getLarissa(@ReqUser() u: RequestUser) {
    return this.agents.getLarissaConfig(u.tenantId);
  }

  @Patch("larissa")
  patchLarissa(@ReqUser() u: RequestUser, @Body() body: unknown) {
    const b = body as {
      larissaEnabled?: boolean;
      larissaModel?: string | null;
      larissaReplyDelayMs?: number;
    };
    return this.agents.updateLarissaConfig(u.tenantId, b);
  }

  @Post("larissa/sync-skills")
  syncSkills(@ReqUser() u: RequestUser) {
    return this.agents.syncSkills(u.tenantId);
  }

  @Post("conversations/:id/activate")
  activateLarissa(
    @ReqUser() u: RequestUser,
    @Param("id") conversationId: string,
  ) {
    return this.agents.activateLarissaOnConversation(u.tenantId, conversationId);
  }

  @Post("conversations/:id/takeover")
  takeover(
    @ReqUser() u: RequestUser,
    @Param("id") conversationId: string,
  ) {
    return this.agents.takeoverConversation(
      u.tenantId,
      u.userId,
      conversationId,
    );
  }
}
