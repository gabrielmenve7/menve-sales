import { Module } from "@nestjs/common";
import { ProductCollectionsController } from "./product-collections.controller";
import { ProductCollectionsService } from "./product-collections.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  controllers: [ProductsController, ProductCollectionsController],
  providers: [ProductsService, ProductCollectionsService],
  exports: [ProductsService, ProductCollectionsService],
})
export class ProductsModule {}
