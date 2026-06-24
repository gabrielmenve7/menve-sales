import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get("gabriel")
  getGabriel(@ReqUser() u: RequestUser) {
    return this.agents.getGabrielConfig(u.tenantId);
  }

  @Patch("gabriel")
  patchGabriel(@ReqUser() u: RequestUser, @Body() body: unknown) {
    const b = body as {
      gabrielEnabled?: boolean;
      gabrielModel?: string | null;
      gabrielReplyDelayMs?: number;
    };
    return this.agents.updateGabrielConfig(u.tenantId, b);
  }

  @Post("gabriel/sync-skills")
  syncSkills(@ReqUser() u: RequestUser) {
    return this.agents.syncSkills(u.tenantId);
  }

  @Post("conversations/:id/activate")
  activateGabriel(
    @ReqUser() u: RequestUser,
    @Param("id") conversationId: string,
  ) {
    return this.agents.activateGabrielOnConversation(u.tenantId, conversationId);
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
