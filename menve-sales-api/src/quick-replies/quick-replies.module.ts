import { Module } from "@nestjs/common";
import { QuickReplyCategoriesController } from "./quick-reply-categories.controller";
import { QuickRepliesController } from "./quick-replies.controller";
import { QuickRepliesService } from "./quick-replies.service";

@Module({
  controllers: [QuickRepliesController, QuickReplyCategoriesController],
  providers: [QuickRepliesService],
})
export class QuickRepliesModule {}
