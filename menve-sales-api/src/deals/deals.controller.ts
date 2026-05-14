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
import { DealsService } from "./deals.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("deals")
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.deals.create(u.tenantId, u.userId, body);
  }

  /** Deve vir antes de `GET :id` para não capturar `next-in-stage` como id. */
  @Get(":id/next-in-stage")
  nextInStage(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.deals.nextOpenDealInSameStageQueue(u.tenantId, id);
  }

  @Get(":id")
  getOne(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.deals.getById(u.tenantId, id);
  }

  @Get(":id/items")
  listItems(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.deals.listItems(u.tenantId, id);
  }

  @Put(":id/items")
  replaceItems(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.deals.replaceItems(u.tenantId, id, body);
  }

  @Patch(":id/stage")
  moveStage(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: { stageId?: string },
  ) {
    if (!body.stageId) {
      throw new BadRequestException("stageId é obrigatório");
    }
    return this.deals.moveStage(u.tenantId, u.userId, id, body.stageId);
  }

  @Patch(":id/won")
  won(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.deals.markWon(u.tenantId, u.userId, id);
  }

  @Patch(":id/lost")
  lost(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: { lostReason?: string },
  ) {
    return this.deals.markLost(u.tenantId, u.userId, id, body.lostReason ?? "");
  }

  @Patch(":id/custom-data")
  updateCustomData(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: { values?: Record<string, unknown> },
  ) {
    return this.deals.updateCustomData(
      u.tenantId,
      u.userId,
      id,
      body.values ?? {},
    );
  }

  @Patch(":id/archive")
  archive(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.deals.archive(u.tenantId, u.userId, id);
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.deals.remove(u.tenantId, id);
  }

  /** Atualização parcial (ex.: responsável). Rotas mais específicas ficam acima. */
  @Patch(":id")
  patch(@ReqUser() u: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.deals.patch(u.tenantId, u.userId, id, body);
  }
}
