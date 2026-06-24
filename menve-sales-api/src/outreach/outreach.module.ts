import { Module, forwardRef } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { PipelineAutomationsModule } from "../pipeline-automations/pipeline-automations.module";
import { OutreachController } from "./outreach.controller";
import { OutreachService } from "./outreach.service";
import { OutreachWorkerService } from "./outreach-worker.service";

@Module({
  imports: [
    forwardRef(() => PipelineAutomationsModule),
    forwardRef(() => AgentsModule),
  ],
  controllers: [OutreachController],
  providers: [OutreachService, OutreachWorkerService],
  exports: [OutreachService],
})
export class OutreachModule {}
