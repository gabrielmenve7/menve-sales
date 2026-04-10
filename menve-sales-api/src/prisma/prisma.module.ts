import { Global, Module } from "@nestjs/common";
import { AppBootstrapService } from "./app-bootstrap.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService, AppBootstrapService],
  exports: [PrismaService],
})
export class PrismaModule {}
