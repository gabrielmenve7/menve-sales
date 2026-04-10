import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkspaceAccessService } from "./workspace-access.service";
import { WorkspacesService } from "./workspaces.service";
import { WorkspacesController } from "./workspaces.controller";

@Module({
  imports: [PrismaModule],
  controllers: [WorkspacesController],
  providers: [WorkspaceAccessService, WorkspacesService],
  exports: [WorkspaceAccessService, WorkspacesService],
})
export class WorkspacesModule {}
