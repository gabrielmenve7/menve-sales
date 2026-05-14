import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { ProductCollectionsService } from "./product-collections.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("product-collections")
export class ProductCollectionsController {
  constructor(
    private readonly productCollections: ProductCollectionsService,
  ) {}

  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.productCollections.list(u.tenantId);
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.productCollections.create(u.tenantId, body);
  }

  @Put(":id")
  update(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.productCollections.update(u.tenantId, id, body);
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.productCollections.delete(u.tenantId, id);
  }
}
