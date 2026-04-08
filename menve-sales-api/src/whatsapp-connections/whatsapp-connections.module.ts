import { Module } from "@nestjs/common";
import { WhatsappConnectionsController } from "./whatsapp-connections.controller";
import { WhatsappConnectionsService } from "./whatsapp-connections.service";

@Module({
  controllers: [WhatsappConnectionsController],
  providers: [WhatsappConnectionsService],
})
export class WhatsappConnectionsModule {}
