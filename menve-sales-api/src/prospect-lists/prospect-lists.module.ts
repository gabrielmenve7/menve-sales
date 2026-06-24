import { Module } from "@nestjs/common";
import { ProspectListsController } from "./prospect-lists.controller";
import { ProspectListsService } from "./prospect-lists.service";

@Module({
  controllers: [ProspectListsController],
  providers: [ProspectListsService],
})
export class ProspectListsModule {}
