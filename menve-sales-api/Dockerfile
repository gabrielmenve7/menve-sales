# Menve Nest API — build a partir da RAIZ do monorepo.
# Há dois lockfiles: raiz (web) e menve-sales-api (Nest). `npm ci` só na raiz NÃO instala @nestjs/cli.
#
# Railway: Root Directory = raiz do repo, Dockerfile path = menve-sales-api/Dockerfile
# Local: docker build -f menve-sales-api/Dockerfile .

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

FROM base AS deps
# Lock da raiz (Next + prisma na raiz para generate)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Lock da API (Nest, @nestjs/cli, TypeScript…)
COPY menve-sales-api/package.json menve-sales-api/package-lock.json ./menve-sales-api/
WORKDIR /repo/menve-sales-api
RUN npm ci --ignore-scripts
WORKDIR /repo

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/menve-sales-api/node_modules ./menve-sales-api/node_modules
COPY package.json package-lock.json ./
COPY menve-sales-api ./menve-sales-api

# Client em ../../node_modules/.prisma/client (relativo ao schema)
RUN npx prisma generate --schema menve-sales-api/prisma/schema.prisma

WORKDIR /repo/menve-sales-api
RUN npm run build
WORKDIR /repo

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs
WORKDIR /app

COPY --from=builder /repo/menve-sales-api/package.json ./
COPY --from=builder /repo/menve-sales-api/dist ./dist
COPY --from=builder /repo/menve-sales-api/prisma ./prisma
COPY --from=builder /repo/menve-sales-api/node_modules ./node_modules
COPY --from=builder /repo/node_modules/.prisma ./node_modules/.prisma

RUN npm prune --omit=dev

USER nestjs
EXPOSE 4000
ENV PORT=4000
CMD ["node", "dist/main.js"]
