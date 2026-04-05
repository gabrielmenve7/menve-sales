import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { TagsService } from "./tags.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("tags")
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.tags.list(u.tenantId);
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.tags.create(u.tenantId, body);
  }

  @Post("catalog")
  createCatalog(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.tags.createCatalog(u, body);
  }

  @Put(":id")
  update(@ReqUser() u: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.tags.update(u, { ...(body as object), id });
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.tags.delete(u, id);
  }
}
