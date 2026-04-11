import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Não bloqueia o bind HTTP: Neon pausado/lento fazia o healthcheck da Railway falhar
    // antes de `app.listen()` (Prisma + bootstrap aguardavam o DB).
    void this.$connect().catch((err: unknown) => {
      console.error(
        "[PrismaService] Conexão inicial com o Postgres falhou (nova tentativa na próxima query):",
        err instanceof Error ? err.message : err,
      );
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
