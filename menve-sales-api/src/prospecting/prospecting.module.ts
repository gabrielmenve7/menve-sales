import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProspectingController } from "./prospecting.controller";
import { ProspectingService } from "./prospecting.service";

@Module({
  imports: [PrismaModule],
  controllers: [ProspectingController],
  providers: [ProspectingService],
})
export class ProspectingModule {}
