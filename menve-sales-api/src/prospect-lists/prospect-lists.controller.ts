import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from "@nestjs/common";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { ProspectListsService } from "./prospect-lists.service";

@Controller("prospect-lists")
export class ProspectListsController {
  constructor(private readonly lists: ProspectListsService) {}

  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.lists.list(u.tenantId);
  }

  @Get("primary")
  getPrimary(@ReqUser() u: RequestUser) {
    return this.lists.getPrimary(u.tenantId, u.userId);
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.lists.create(u, body);
  }

  @Get(":id")
  getById(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.lists.getById(u.tenantId, id);
  }

  @Post(":id/items")
  addItems(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.lists.addItems(u, id, body);
  }

  @Delete(":id/items/:itemId")
  removeItem(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ) {
    return this.lists.removeItem(u, id, itemId);
  }
}
