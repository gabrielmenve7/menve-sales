import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client";
import { ReqUser } from "../common/req-user.decorator";
import { OptionalActiveTenant } from "../common/optional-active-tenant.decorator";
import type { RequestUser } from "../common/request-user";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @OptionalActiveTenant()
  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.workspaces.listWorkspaces(u.userId);
  }

  @OptionalActiveTenant()
  @Post()
  create(
    @ReqUser() u: RequestUser,
    @Body() body: { name?: string; slug?: string },
  ) {
    return this.workspaces.createWorkspace(u.userId, {
      name: body.name ?? "",
      slug: body.slug,
    });
  }

  @OptionalActiveTenant()
  @Post("invites/accept")
  acceptInvite(
    @ReqUser() u: RequestUser,
    @Body() body: { token?: string },
  ) {
    return this.workspaces.acceptInvite(u.userId, body.token ?? "");
  }

  @Post(":tenantId/invites")
  createInvite(
    @ReqUser() u: RequestUser,
    @Param("tenantId") tenantId: string,
    @Body() body: { email?: string; role?: WorkspaceRole },
  ) {
    return this.workspaces.createInvite(u, tenantId, {
      email: body.email ?? "",
      role: body.role,
    });
  }
}
