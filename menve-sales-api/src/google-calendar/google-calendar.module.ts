import { Module, forwardRef } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { DealsModule } from "../deals/deals.module";
import { PrismaModule } from "../prisma/prisma.module";
import { GoogleCalendarController } from "./google-calendar.controller";
import { GoogleCalendarService } from "./google-calendar.service";

@Module({
  imports: [PrismaModule, forwardRef(() => DealsModule), forwardRef(() => AgentsModule)],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}