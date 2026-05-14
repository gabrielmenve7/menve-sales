import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ZodError } from "zod";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { DashboardBoardsService } from "./dashboard-boards.service";
import { DashboardQueryService } from "./dashboard-query.service";
import { DashboardService } from "./dashboard.service";
import { widgetQueryBulkSchema } from "./dashboard-widget-spec.zod";

function zodToBadRequest(e: ZodError) {
  return new BadRequestException({
    message: "Validação falhou",
    issues: e.flatten(),
  });
}

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly boards: DashboardBoardsService,
    private readonly query: DashboardQueryService,
  ) {}

  @Get("stats")
  stats(@ReqUser() u: RequestUser) {
    return this.dashboard.stats(u.tenantId);
  }

  @Get("boards")
  listBoards(@ReqUser() u: RequestUser) {
    return this.boards.list(u.tenantId, u.userId);
  }

  @Post("boards")
  createBoard(@ReqUser() u: RequestUser, @Body() body: { name?: string }) {
    return this.boards.create(u.tenantId, u.userId, body?.name);
  }

  @Post("boards/seed-default")
  seedDefaultBoard(
    @ReqUser() u: RequestUser,
    @Body() body: { force?: boolean; onlyIfEmpty?: boolean },
  ) {
    return this.boards.seedDefault(u.tenantId, u.userId, body);
  }

  @Patch("boards/:id")
  updateBoard(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: { name?: string; layoutJson?: unknown },
  ) {
    try {
      return this.boards.update(u.tenantId, u.userId, id, body);
    } catch (e) {
      if (e instanceof ZodError) throw zodToBadRequest(e);
      throw e;
    }
  }

  @Delete("boards/:id")
  deleteBoard(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.boards.delete(u.tenantId, u.userId, id);
  }

  @Post("boards/:id/duplicate")
  duplicateBoard(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.boards.duplicate(u.tenantId, u.userId, id);
  }

  @Post("widgets/query")
  async widgetQuery(
    @ReqUser() u: RequestUser,
    @Body() body: { spec?: unknown },
  ) {
    if (body?.spec === undefined) {
      throw new BadRequestException("spec obrigatório");
    }
    try {
      return await this.query.query(u.tenantId, body.spec);
    } catch (e) {
      if (e instanceof ZodError) throw zodToBadRequest(e);
      throw e;
    }
  }

  @Post("widgets/query-bulk")
  widgetQueryBulk(
    @ReqUser() u: RequestUser,
    @Body() body: unknown,
  ) {
    const parsed = widgetQueryBulkSchema.safeParse(body);
    if (!parsed.success) throw zodToBadRequest(parsed.error);
    try {
      return this.query.queryBulk(u.tenantId, parsed.data.specs);
    } catch (e) {
      if (e instanceof ZodError) throw zodToBadRequest(e);
      throw e;
    }
  }
}
