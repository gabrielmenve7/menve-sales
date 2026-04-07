import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { CustomFieldsService } from "./custom-fields.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly cf: CustomFieldsService) {}

  @Get()
  list(
    @ReqUser() u: RequestUser,
    @Query("entity") entity?: "CONTACT" | "DEAL",
  ) {
    return this.cf.listForTenant(u.tenantId, entity);
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.cf.create(u, body);
  }

  @Put(":id")
  update(@ReqUser() u: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.cf.update(u, { ...(body as object), id });
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.cf.delete(u, id);
  }

  @Patch("reorder")
  reorder(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.cf.reorder(u, body);
  }
}
