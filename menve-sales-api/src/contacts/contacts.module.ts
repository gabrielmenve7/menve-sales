import { Module, forwardRef } from "@nestjs/common";
import { PipelineAutomationsModule } from "../pipeline-automations/pipeline-automations.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [forwardRef(() => PipelineAutomationsModule)],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
