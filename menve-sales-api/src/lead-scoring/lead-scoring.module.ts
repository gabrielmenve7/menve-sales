import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LeadScoringController } from "./lead-scoring.controller";
import { LeadScoringService } from "./lead-scoring.service";

@Module({
  imports: [PrismaModule],
  controllers: [LeadScoringController],
  providers: [LeadScoringService],
  exports: [LeadScoringService],
})
export class LeadScoringModule {}
