import { Body, Controller, Delete, Get, Param, Patch, Post, BadRequestException } from "@nestjs/common";
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

  @Patch(":tenantId/members/:userId")
  patchMember(
    @ReqUser() u: RequestUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: { role?: WorkspaceRole },
  ) {
    if (!body.role) {
      throw new BadRequestException("role é obrigatório");
    }
    return this.workspaces.patchMemberRole(u, tenantId, userId, body.role);
  }

  @Delete(":tenantId/members/:userId")
  removeMember(
    @ReqUser() u: RequestUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
  ) {
    return this.workspaces.removeMember(u, tenantId, userId);
  }
}
