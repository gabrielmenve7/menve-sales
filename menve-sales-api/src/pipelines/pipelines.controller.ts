import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { PipelinesService } from "./pipelines.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("pipelines")
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.pipelines.list(u.tenantId);
  }

  @Patch("reorder")
  reorderPipelines(
    @ReqUser() u: RequestUser,
    @Body() body: { orderedPipelineIds?: string[] },
  ) {
    return this.pipelines.reorderPipelines(u, body.orderedPipelineIds ?? []);
  }

  @Get(":id/deals")
  deals(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.pipelines.getPipelineDeals(u.tenantId, id);
  }

  @Post()
  create(
    @ReqUser() u: RequestUser,
    @Body() body: { name?: string; color?: string | null },
  ) {
    if (!body.name) throw new Error("name required");
    return this.pipelines.createPipeline(u, {
      name: body.name,
      color: body.color,
    });
  }

  @Put(":id")
  update(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: { name?: string; color?: string | null },
  ) {
    return this.pipelines.updatePipeline(u, { id, ...body });
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.pipelines.deletePipeline(u, id);
  }

  @Patch(":id/default")
  setDefault(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.pipelines.setDefault(u, id);
  }

  @Post(":id/stages")
  createStage(
    @ReqUser() u: RequestUser,
    @Param("id") pipelineId: string,
    @Body()
    body: {
      name?: string;
      probability?: number | null;
      color?: string | null;
    },
  ) {
    if (!body.name) throw new Error("name required");
    return this.pipelines.createStage(u, {
      pipelineId,
      name: body.name,
      probability: body.probability,
      color: body.color,
    });
  }
}

@Controller("stages")
export class StagesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Put(":id")
  update(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      probability?: number | null;
      color?: string | null;
    },
  ) {
    return this.pipelines.updateStage(u, { id, ...body });
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.pipelines.deleteStage(u, id);
  }

  @Patch("reorder")
  reorder(
    @ReqUser() u: RequestUser,
    @Body() body: { pipelineId?: string; orderedStageIds?: string[] },
  ) {
    if (!body.pipelineId) {
      throw new BadRequestException("pipelineId required");
    }
    return this.pipelines.reorderStages(
      u,
      body.pipelineId,
      body.orderedStageIds ?? [],
    );
  }
}
