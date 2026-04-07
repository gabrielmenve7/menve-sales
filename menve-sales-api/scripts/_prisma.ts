import { PrismaClient } from "@prisma/client";

/** Scripts CLI — use o client gerado em `menve-sales-api` (ou raiz do monorepo após `prisma generate`). */
export const scriptPrisma = new PrismaClient();
