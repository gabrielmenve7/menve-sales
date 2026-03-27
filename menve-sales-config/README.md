# Menve Sales Config

Esta pasta centraliza arquivos de configuracao e operacao do projeto.

## Estrutura oficial

- `menve-sales-web/`: frontend e app Next.js (inclui rotas API atuais).
- `menve-sales-api/`: prisma, scripts operacionais, workers e docs tecnicos.
- `menve-sales-config/`: arquivos de ambiente, build, deploy e comandos.
- `.cursor/`: plans, rules, agents e skills para apoio ao desenvolvimento.

## O que fica em `menve-sales-config`

- `package.json` e `package-lock.json` do projeto.
- `vercel.json`.
- arquivos de ambiente (`.env`, `.env.local`, `.env.example`).
- Docker (`Dockerfile`, `docker-compose*.yml`, `docker-entrypoint.sh`, `.dockerignore`).
- documentacao geral (`README.md`).

## Convencoes

- Evitar arquivos soltos na raiz do repositorio.
- Novas configuracoes de execucao/deploy devem entrar em `menve-sales-config`.
- Novos planos/regras/agentes devem entrar em `.cursor`.
- Ao adicionar scripts no `package.json`, usar caminhos relativos a `menve-sales-config`.
# Menve Sales — CRM Inside Sales

Next.js (App Router) + PostgreSQL (Prisma) + NextAuth + integrações WhatsApp (Meta / Evolution).

**Filas (BullMQ / worker):** não estão implementadas no código do app — o `package.json` não expõe mais um script `worker`. Redis no [`docker-compose.yml`](docker-compose.yml) é usado pelo **Evolution API** (e opcionalmente por filas futuras), não pelo Next.js em si.

## Visão geral do produto

| Fase | Escopo |
|------|--------|
| **1 — Fundação** | Stack, auth, multi-tenant por header, UI base (shadcn), Docker, `tenant-async` opcional |
| **2 — CRM core** | Contatos, pipeline Kanban, deals, atividades, timeline, import/export CSV, tags, ganho/perdido |
| **3 — WhatsApp** | Inbox, webhooks Evolution/Meta, integração provider, respostas rápidas e notas internas na conversa |
| **4 — Analytics** | Dashboard `/analytics` (funil, vendedores, origem, previsão, ganhos/perdas, motivos de perda), `/admin` cross-tenant |
| **5 — Polish / deploy** | Healthcheck, CI, testes (`vitest`, Playwright), runbook de deploy ([Deploy](#deploy-mvp)) |

Melhorias futuras opcionais: RLS no Postgres, Prisma com `tenant_id` automático, magic link, campos customizados no UI, worker BullMQ para jobs assíncronos.

## Rotas principais (app)

| Rota | Descrição |
|------|-----------|
| `/` | Landing |
| `/login` | Login |
| `/dashboard` | Dashboard do tenant |
| `/contacts` | Lista de contatos |
| `/contacts/[id]` | Ficha + timeline + tags |
| `/pipeline` | Kanban + deals |
| `/activities` | Atividades |
| `/inbox` | Inbox WhatsApp (lista, chat, respostas rápidas, notas) |
| `/settings` | Configurações (WhatsApp, webhooks, respostas rápidas) |
| `/analytics` | Analytics (funil, métricas, fechamentos) |
| `/admin` | Admin Menve (super_admin): visão por tenant |

## API útil

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/api/health` | Healthcheck (DB + `ok`); `503` se o banco falhar |
| `GET` | `/api/inbox` | Dados do inbox (autenticado) |
| `POST` | `/api/webhooks/whatsapp/evolution/[connectionId]` | Webhook Evolution |
| `GET` / `POST` | `/api/webhooks/whatsapp/meta` | Webhook Meta Cloud API |

## Setup rápido (desenvolvimento)

1. Copie `.env.example` para `.env` e defina `NEXTAUTH_SECRET`.

2. Infra local (Postgres + Redis para Evolution; Redis não é exigido pelo app Next):

```bash
docker compose up -d postgres redis
```

3. Dependências e banco (migrações versionadas):

```bash
npm install
npx prisma generate
npm run db:migrate
npm run db:seed
```

4. App:

```bash
npm run dev
```

Login demo: `owner@demo.com` / `admin123` · Super admin: `admin@menve.com` / `admin123`

Para prototipar schema sem histórico de migração (apenas dev), ainda existe `npm run db:push` — **em produção use `npm run db:deploy`.**

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento (Turbopack) |
| `npm run build` | `prisma generate` + `next build` (local/Docker; na **Vercel** o build inclui `migrate deploy` — ver [`vercel.json`](vercel.json)) |
| `npm run start` | Servidor produção |
| `npm run lint` | ESLint |
| `npm run db:push` | Sincroniza schema sem migration (só dev) |
| `npm run db:migrate` | Cria/aplica migrações locais (`migrate dev`) |
| `npm run db:deploy` | Aplica migrações em produção (`migrate deploy`) |
| `npm run db:seed` | Seed |
| `npm run db:studio` | Prisma Studio |
| `npm run test` | Vitest |
| `npm run test:e2e` | Playwright (API health; exige `DATABASE_URL`, `npm run build` antes — o CI faz isso) |

## Variáveis de ambiente

Ver [`.env.example`](.env.example): `DATABASE_URL`, `NEXTAUTH_*`, `DEFAULT_TENANT_SLUG`, chaves Evolution e Meta. `REDIS_URL` é opcional para o app (Evolution no compose usa o serviço `redis`).

## Deploy (MVP)

Runbook detalhado: [`docs/DEPLOY.md`](docs/DEPLOY.md) (Path A — Vercel + Neon, Path B — VPS com Docker).

Resumo **Vercel:**

- Conecte o repositório Git, defina variáveis em Production (`DATABASE_URL`, `NEXTAUTH_*`, `NEXT_PUBLIC_APP_URL`, etc. — ver [`docs/DEPLOY.md`](docs/DEPLOY.md) Path A).
- O arquivo [`vercel.json`](vercel.json) faz o build com `prisma migrate deploy` antes do `next build`.

Resumo geral:

- **Produção:** `DATABASE_URL` gerenciado, `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` em **HTTPS**, `NEXTAUTH_SECRET` forte (≥32 chars). Localmente: `npm ci`, `prisma generate`, `prisma migrate deploy`, `next build`.
- **Health:** `GET /api/health` para load balancer / uptime.
- **Multi-tenant por subdomínio:** pode exigir DNS wildcard e teste com header `Host` — ver seção em `docs/DEPLOY.md`.
- **Smoke manual pós-deploy:** [`docs/SMOKE-CHECKLIST.md`](docs/SMOKE-CHECKLIST.md).

## Webhooks WhatsApp

Checklist de Go-live (URLs públicas, Evolution/Meta): [`docs/WHATSAPP-GOLIVE.md`](docs/WHATSAPP-GOLIVE.md).

Rotas:

- Evolution: `POST /api/webhooks/whatsapp/evolution/[connectionId]`
- Meta: `GET` / `POST /api/webhooks/whatsapp/meta`
