import { Module, forwardRef } from "@nestjs/common";
import { GoogleCalendarModule } from "../google-calendar/google-calendar.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AiOutboundService } from "./ai-outbound.service";
import { HandoffService } from "./handoff.service";
import { GabrielEligibilityService } from "./gabriel-eligibility.service";
import { GabrielOrchestratorService } from "./gabriel-orchestrator.service";
import { SkillSyncService } from "./skill-sync.service";
import { AudioTranscriptionService } from "./audio-transcription.service";
import { GabrielToolsService } from "./tools/gabriel-tools.service";

@Module({
  imports: [PrismaModule, forwardRef(() => GoogleCalendarModule)],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    SkillSyncService,
    GabrielEligibilityService,
    GabrielOrchestratorService,
    HandoffService,
    GabrielToolsService,
    AudioTranscriptionService,
    AiOutboundService,
  ],
  exports: [
    GabrielOrchestratorService,
    HandoffService,
    AgentsService,
    SkillSyncService,
    AiOutboundService,
  ],
})
export class AgentsModule {}
