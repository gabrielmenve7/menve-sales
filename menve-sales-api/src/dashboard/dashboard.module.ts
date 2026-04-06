import { Module } from "@nestjs/common";
import { DashboardBoardsService } from "./dashboard-boards.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardQueryService } from "./dashboard-query.service";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardBoardsService, DashboardQueryService],
})
export class DashboardModule {}
