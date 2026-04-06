import { Body, Controller, Get, Patch } from "@nestjs/common";
import { assertCanManageWorkspaceFeatures } from "../common/rbac";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@ReqUser() u: RequestUser) {
    return this.settings.getBundle(u.tenantId);
  }

  @Get("members")
  members(@ReqUser() u: RequestUser) {
    return this.settings.getMembers(u.tenantId);
  }

  @Patch("tenant")
  updateTenant(
    @ReqUser() u: RequestUser,
    @Body() body: { name?: string; researchEnabled?: boolean },
  ) {
    assertCanManageWorkspaceFeatures(u.role);
    return this.settings.updateTenant(u.tenantId, body);
  }
}
