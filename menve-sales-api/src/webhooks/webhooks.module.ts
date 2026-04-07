import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { MessageProcessingService } from "../whatsapp/message-processing.service";

@Module({
  controllers: [WebhooksController],
  providers: [MessageProcessingService],
})
export class WebhooksModule {}
