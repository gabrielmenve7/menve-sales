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

  /**
   * Liveness para load balancer / Railway (sempre 200 se o processo subiu).
   * Use `GET /health` para readiness com ping no Postgres.
   */
  @Public()
  @Get("live")
  live() {
    return { ok: true, ts: new Date().toISOString() };
  }

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
