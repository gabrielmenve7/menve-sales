import { Module } from "@nestjs/common";
import { PipelinesController, StagesController } from "./pipelines.controller";
import { PipelinesService } from "./pipelines.service";

@Module({
  controllers: [PipelinesController, StagesController],
  providers: [PipelinesService],
  exports: [PipelinesService],
})
export class PipelinesModule {}
