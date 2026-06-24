import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { MessageProcessingService } from "../whatsapp/message-processing.service";
import { OutreachModule } from "../outreach/outreach.module";

@Module({
  imports: [OutreachModule],
  controllers: [WebhooksController],
  providers: [MessageProcessingService],
})
export class WebhooksModule {}
