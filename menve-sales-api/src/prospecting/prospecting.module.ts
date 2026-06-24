import { Module, forwardRef } from "@nestjs/common";
import { DealsModule } from "../deals/deals.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProspectingController } from "./prospecting.controller";
import { ProspectingService } from "./prospecting.service";

@Module({
  imports: [PrismaModule, forwardRef(() => DealsModule)],
  controllers: [ProspectingController],
  providers: [ProspectingService],
})
export class ProspectingModule {}
