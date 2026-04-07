# Menve Sales — imagem de produção (Path B / VPS)
# Build: docker build -t menve-sales .
# Requer DATABASE_URL e demais envs em runtime (compose ou -e).

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate --schema ./menve-sales-api/prisma/schema.prisma
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/menve-sales-web/.next ./menve-sales-web/.next
COPY --from=builder /app/menve-sales-api/prisma ./menve-sales-api/prisma
COPY --from=builder /app/menve-sales-web/next.config.ts ./menve-sales-web/
COPY --from=builder /app/menve-sales-web/package.json ./menve-sales-web/
COPY --from=builder /app/docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
  && chown nextjs:nodejs /docker-entrypoint.sh \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["/docker-entrypoint.sh"]
