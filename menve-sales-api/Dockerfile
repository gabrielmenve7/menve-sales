# Menve Nest API — build a partir da RAIZ do monorepo (mesmo layout que Prisma `output = ../../node_modules/.prisma/client`).
#
# Railway / Docker:
#   Root Directory = raiz do repo (pasta com package.json e menve-sales-api/)
#   Dockerfile path = menve-sales-api/Dockerfile
#
# Local:
#   docker build -f menve-sales-api/Dockerfile .

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json ./
COPY menve-sales-api/package.json ./menve-sales-api/
# postinstall na raiz roda prisma generate; o schema ainda não foi copiado nesta etapa.
RUN npm ci --ignore-scripts

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY menve-sales-api ./menve-sales-api
RUN npx prisma generate --schema menve-sales-api/prisma/schema.prisma
WORKDIR /repo/menve-sales-api
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs
WORKDIR /app
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/menve-sales-api/dist ./dist
COPY --from=builder /repo/menve-sales-api/prisma ./prisma
COPY --from=builder /repo/menve-sales-api/package.json ./
USER nestjs
EXPOSE 4000
ENV PORT=4000
CMD ["node", "dist/main.js"]
