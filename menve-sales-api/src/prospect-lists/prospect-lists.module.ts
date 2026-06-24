import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProspectListsController } from "./prospect-lists.controller";
import { ProspectListsService } from "./prospect-lists.service";

@Module({
  imports: [PrismaModule],
  controllers: [ProspectListsController],
  providers: [ProspectListsService],
  exports: [ProspectListsService],
})
export class ProspectListsModule {}
