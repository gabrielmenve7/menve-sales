import { Module } from "@nestjs/common";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import { MessageProcessingService } from "../whatsapp/message-processing.service";

@Module({
  controllers: [InboxController],
  providers: [InboxService, MessageProcessingService],
})
export class InboxModule {}
