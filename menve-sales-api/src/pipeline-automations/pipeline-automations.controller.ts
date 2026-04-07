import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { PipelineAutomationsService } from "./pipeline-automations.service";

@Controller("pipelines/:pipelineId/automations")
export class PipelineAutomationsController {
  constructor(private readonly automations: PipelineAutomationsService) {}

  @Get()
  list(@ReqUser() u: RequestUser, @Param("pipelineId") pipelineId: string) {
    return this.automations.list(u.tenantId, pipelineId);
  }

  @Post()
  create(
    @ReqUser() u: RequestUser,
    @Param("pipelineId") pipelineId: string,
    @Body() body: unknown,
  ) {
    return this.automations.create(u, pipelineId, body);
  }

  @Get(":ruleId/runs")
  listRuns(
    @ReqUser() u: RequestUser,
    @Param("pipelineId") pipelineId: string,
    @Param("ruleId") ruleId: string,
    @Query("take") take?: string,
  ) {
    const n = take ? Number(take) : 30;
    return this.automations.listRuns(
      u.tenantId,
      pipelineId,
      ruleId,
      Number.isFinite(n) ? n : 30,
    );
  }

  @Get(":ruleId")
  getOne(
    @ReqUser() u: RequestUser,
    @Param("pipelineId") pipelineId: string,
    @Param("ruleId") ruleId: string,
  ) {
    return this.automations.getOne(u.tenantId, pipelineId, ruleId);
  }

  @Patch(":ruleId")
  update(
    @ReqUser() u: RequestUser,
    @Param("pipelineId") pipelineId: string,
    @Param("ruleId") ruleId: string,
    @Body() body: unknown,
  ) {
    return this.automations.update(u, pipelineId, ruleId, body);
  }

  @Delete(":ruleId")
  remove(
    @ReqUser() u: RequestUser,
    @Param("pipelineId") pipelineId: string,
    @Param("ruleId") ruleId: string,
  ) {
    return this.automations.remove(u, pipelineId, ruleId);
  }
}
