import { Module, forwardRef } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { MessageProcessingService } from "../whatsapp/message-processing.service";
import { OutreachModule } from "../outreach/outreach.module";
import { AgentsModule } from "../agents/agents.module";

@Module({
  imports: [OutreachModule, forwardRef(() => AgentsModule)],
  controllers: [WebhooksController],
  providers: [MessageProcessingService],
})
export class WebhooksModule {}
