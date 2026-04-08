import { Controller, Get } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("tenants")
  tenants(@ReqUser() u: RequestUser) {
    return this.admin.tenants(u);
  }
}
