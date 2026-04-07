import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { ProspectingService } from "./prospecting.service";

@Controller("prospecting")
export class ProspectingController {
  constructor(private readonly prospecting: ProspectingService) {}

  @Post("search")
  search(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.prospecting.search(u.tenantId, u.userId, body);
  }

  @Get("searches")
  listSearches(@ReqUser() u: RequestUser) {
    return this.prospecting.listSearches(u.tenantId);
  }

  @Get("searches/:searchId")
  getSearchStatus(
    @ReqUser() u: RequestUser,
    @Param("searchId") searchId: string,
  ) {
    return this.prospecting.getSearchStatus(u.tenantId, searchId);
  }

  @Post("searches/:searchId/more-web")
  loadMoreWeb(
    @ReqUser() u: RequestUser,
    @Param("searchId") searchId: string,
  ) {
    return this.prospecting.loadMoreWeb(u.tenantId, searchId);
  }

  @Delete("searches/:searchId")
  deleteSearch(
    @ReqUser() u: RequestUser,
    @Param("searchId") searchId: string,
  ) {
    return this.prospecting.deleteSearch(u.tenantId, searchId);
  }

  @Patch("results/:resultId")
  patchResult(
    @ReqUser() u: RequestUser,
    @Param("resultId") resultId: string,
    @Body() body: unknown,
  ) {
    return this.prospecting.patchResult(u.tenantId, resultId, body);
  }

  @Post("results/:resultId/convert")
  convertResult(
    @ReqUser() u: RequestUser,
    @Param("resultId") resultId: string,
    @Body() body: unknown,
  ) {
    return this.prospecting.convertResult(
      u.tenantId,
      u.userId,
      resultId,
      body,
    );
  }

  @Post("convert-bulk")
  convertBulk(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.prospecting.convertBulk(u.tenantId, u.userId, body);
  }
}
