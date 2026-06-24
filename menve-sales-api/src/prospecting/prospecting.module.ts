import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProspectListsModule } from "../prospect-lists/prospect-lists.module";
import { ProspectingController } from "./prospecting.controller";
import { ProspectingService } from "./prospecting.service";

@Module({
  imports: [PrismaModule, ProspectListsModule],
  controllers: [ProspectingController],
  providers: [ProspectingService],
})
export class ProspectingModule {}
