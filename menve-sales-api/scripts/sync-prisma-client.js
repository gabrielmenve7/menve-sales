/**
 * O generator em `schema.prisma` escreve em `../../node_modules/.prisma/client` (raiz do monorepo).
 * O pacote `menve-sales-api/node_modules/@prisma/client/default.js` faz
 * `require('.prisma/client/default')`, que o Node resolve para **este** diretório:
 * `menve-sales-api/node_modules/.prisma/client` (e NÃO para `@prisma/client/.prisma/...`).
 * Sem esta cópia, a API Nest usa um client antigo (sem modelos novos).
 */
const fs = require("node:fs");
const path = require("node:path");

const rootPrisma = path.join(__dirname, "../../node_modules/.prisma/client");
const dest = path.join(__dirname, "../node_modules/.prisma/client");

if (!fs.existsSync(rootPrisma)) {
  console.warn(
    "[sync-prisma-client] Skipping: root generated client not found at",
    rootPrisma,
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(rootPrisma, dest, { recursive: true });
console.log(
  "[sync-prisma-client] Copied Prisma client from monorepo root to menve-sales-api/node_modules/.prisma/client.",
);
