import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/public.decorator";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async get() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: "up", ts: new Date().toISOString() };
    } catch {
      throw new HttpException(
        { ok: false, db: "down" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
