import { Module, forwardRef } from "@nestjs/common";
import { PipelineAutomationsModule } from "../pipeline-automations/pipeline-automations.module";
import { DealPipelinePromotionService } from "./deal-pipeline-promotion.service";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";

@Module({
  imports: [forwardRef(() => PipelineAutomationsModule)],
  controllers: [DealsController],
  providers: [DealsService, DealPipelinePromotionService],
  exports: [DealsService, DealPipelinePromotionService],
})
export class DealsModule {}
