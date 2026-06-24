import { Module, forwardRef } from "@nestjs/common";
import { GoogleCalendarModule } from "../google-calendar/google-calendar.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AiOutboundService } from "./ai-outbound.service";
import { HandoffService } from "./handoff.service";
import { LarissaEligibilityService } from "./larissa-eligibility.service";
import { LarissaOrchestratorService } from "./larissa-orchestrator.service";
import { SkillSyncService } from "./skill-sync.service";
import { AudioTranscriptionService } from "./audio-transcription.service";
import { LarissaToolsService } from "./tools/larissa-tools.service";

@Module({
  imports: [PrismaModule, forwardRef(() => GoogleCalendarModule)],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    SkillSyncService,
    LarissaEligibilityService,
    LarissaOrchestratorService,
    HandoffService,
    LarissaToolsService,
    AudioTranscriptionService,
    AiOutboundService,
  ],
  exports: [
    LarissaOrchestratorService,
    HandoffService,
    AgentsService,
    SkillSyncService,
    AiOutboundService,
  ],
})
export class AgentsModule {}
