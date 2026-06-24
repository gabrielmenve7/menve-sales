import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ActivitiesService } from "./activities.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @ReqUser() u: RequestUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("type") type?: string,
  ) {
    return this.activities.list(u.tenantId, { from, to, assigneeId, type });
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.activities.create(u.tenantId, u.userId, body);
  }

  @Patch(":id/complete")
  complete(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.activities.complete(u.tenantId, id);
  }
}
