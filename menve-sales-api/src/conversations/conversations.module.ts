import { Module } from "@nestjs/common";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { MessageProcessingService } from "../whatsapp/message-processing.service";

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, MessageProcessingService],
})
export class ConversationsModule {}
