import { Module, forwardRef } from "@nestjs/common";
import { PipelineAutomationsModule } from "../pipeline-automations/pipeline-automations.module";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";

@Module({
  imports: [forwardRef(() => PipelineAutomationsModule)],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
