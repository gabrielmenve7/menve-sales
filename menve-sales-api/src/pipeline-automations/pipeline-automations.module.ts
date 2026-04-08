import { Module, forwardRef } from "@nestjs/common";
import { DealsModule } from "../deals/deals.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PipelineAutomationEngineService } from "./pipeline-automation-engine.service";
import { PipelineAutomationsController } from "./pipeline-automations.controller";
import { PipelineAutomationsService } from "./pipeline-automations.service";

@Module({
  imports: [PrismaModule, forwardRef(() => DealsModule)],
  controllers: [PipelineAutomationsController],
  providers: [PipelineAutomationsService, PipelineAutomationEngineService],
  exports: [PipelineAutomationEngineService],
})
export class PipelineAutomationsModule {}
