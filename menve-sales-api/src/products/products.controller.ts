import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { ProductsService } from "./products.service";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@ReqUser() u: RequestUser) {
    return this.products.list(u.tenantId);
  }

  @Get(":id")
  getOne(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.products.getById(u.tenantId, id);
  }

  @Post()
  create(@ReqUser() u: RequestUser, @Body() body: unknown) {
    return this.products.create(u.tenantId, body);
  }

  @Put(":id")
  update(
    @ReqUser() u: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.products.update(u.tenantId, id, body);
  }

  @Delete(":id")
  remove(@ReqUser() u: RequestUser, @Param("id") id: string) {
    return this.products.delete(u.tenantId, id);
  }
}
