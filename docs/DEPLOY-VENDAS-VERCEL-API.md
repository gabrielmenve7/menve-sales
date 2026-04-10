# Deploy: `vendas.menvedigital.com.br` (Vercel) + API Nest separada

Guia operacional para o modelo **Next.js na Vercel** e **NestJS em outro PaaS**, com Postgres (ex.: Neon) compartilhado.

**Passo a passo clique a clique (Neon, Railway, Vercel, DNS, seed, smoke):** [`DEPLOY-PASSO-A-PASSO-BOTOES.md`](./DEPLOY-PASSO-A-PASSO-BOTOES.md).

## Arquitetura

- **Web:** Vercel, domínio `https://vendas.menvedigital.com.br` (repositório na **raiz** do monorepo — [`vercel.json`](../vercel.json) com `outputDirectory: menve-sales-web/.next` porque o build do Next roda dentro de `menve-sales-web`).
- **API:** processo HTTP sempre ligado (Railway, Render, Fly.io, Cloud Run, VPS + Docker). Não use a Vercel para o `main.ts` da API sem adaptação serverless.
- **Banco:** Neon (ou outro Postgres). Mesmo cluster para API e para o build da Vercel (`prisma migrate deploy`).

## 1. Neon (ou Postgres)

1. Crie o projeto no [Neon](https://neon.tech) (ou equivalente).
2. Copie duas connection strings:
   - **`DATABASE_URL`** — URL com **pooler** (host costuma ter `-pooler`).
   - **`DIRECT_URL`** — URL **direta** (sem `-pooler`). Obrigatória para `prisma migrate deploy` na Vercel (evita P1002 no advisory lock).
3. Local com um único Postgres: use o **mesmo** valor nas duas variáveis.

## 2. API Nest (PaaS)

1. **Contexto de build Docker:** **raiz do monorepo** (onde está o `package.json` principal). O [`Dockerfile`](../menve-sales-api/Dockerfile) copia `menve-sales-api/` e o `node_modules` gerado com Prisma na raiz. No Railway: *Root Directory* = raiz do repo; *Dockerfile path* = `menve-sales-api/Dockerfile`.
2. **Arquivos de referência:** [`menve-sales-api/railway.toml`](../menve-sales-api/railway.toml), [`menve-sales-api/render.yaml`](../menve-sales-api/render.yaml).
3. **Variáveis mínimas** (alinhar com [`menve-sales-api/.env.example`](../menve-sales-api/.env.example)):

| Variável | Observação |
|----------|------------|
| `DATABASE_URL` | Igual ao da API em produção (pooler OK em runtime) |
| `DIRECT_URL` | Conexão direta Neon (migrate manual / scripts, se usar) |
| `JWT_SECRET` | Forte, dedicado à produção |
| `INTERNAL_API_KEY` | **Mesmo valor** que na Vercel (`INTERNAL_API_KEY` do Next) |
| `PUBLIC_APP_URL` | URL pública **HTTPS** da API se webhooks Evolution/Meta apontarem para ela (ex. `https://api.vendas.menvedigital.com.br`) |
| `CORS_ORIGIN` | `https://vendas.menvedigital.com.br` (vários hosts: separar por vírgula) |
| `PORT` | O PaaS costuma injetar; o Dockerfile expõe 4000 |

4. **Domínio customizado** no PaaS (ex. `api.vendas.menvedigital.com.br`) e TLS gerenciado pelo provedor.
5. **Healthcheck:** `GET https://<sua-api>/health` → `200`, `db: up`.

Migrações: o repositório roda **`prisma migrate deploy` no build da Vercel** ([`vercel.json`](../vercel.json)). Evite rodar migrate em dois lugares sem coordenação; em dúvida, mantenha só no deploy do Next.

## 3. Vercel (só web)

1. **Import:** projeto Git com **Root Directory** = **raiz do monorepo** (pasta que contém `vercel.json`). Não defina “Output Directory” manualmente no painel para outro valor — o `vercel.json` já aponta para `menve-sales-web/.next`.
2. **Domínio:** em *Settings → Domains*, adicione `vendas.menvedigital.com.br` e siga as instruções de DNS.
3. **Variáveis (Production):**

| Variável | Valor típico |
|----------|----------------|
| `DATABASE_URL` | Neon pooler + TLS |
| `DIRECT_URL` | Neon direto + TLS |
| `NEXTAUTH_URL` | `https://vendas.menvedigital.com.br` |
| `NEXT_PUBLIC_APP_URL` | Igual a `NEXTAUTH_URL` |
| `AUTH_SECRET` ou `NEXTAUTH_SECRET` | ≥ 32 caracteres aleatórios |
| `INTERNAL_API_URL` | `https://api.vendas.menvedigital.com.br` (sem barra final) |
| `INTERNAL_API_KEY` | Idêntico ao da API |
| `DEFAULT_TENANT_SLUG` | Com hostname `vendas.menvedigital.com.br`, o slug vem do host (`vendas`); este fallback vale para `www` / apex |

**Resolução de tenant no Next:** com `DATABASE_URL` definido, o servidor lê a tabela `Tenant` **direto no Postgres** (mesmo banco do `migrate deploy`). Assim, subdomínios como `crm.*` funcionam mesmo se `INTERNAL_API_URL` estiver errado temporariamente; login e APIs autenticadas continuam exigindo API + `INTERNAL_API_KEY` corretos.

Opcional: Evolution, Meta — ver [`menve-sales-api/docs/WHATSAPP-GOLIVE.md`](../menve-sales-api/docs/WHATSAPP-GOLIVE.md).

## 4. DNS (ex.: Registro.br)

| Nome | Tipo | Destino |
|------|------|---------|
| `vendas` | CNAME | Valor indicado pela Vercel ao adicionar o domínio |
| `api.vendas` (ou nome que escolher para a API) | CNAME | Host público do serviço da API no PaaS |

**Wildcard** `*.menvedigital.com.br` só é necessário se cada cliente tiver subdomínio próprio (multi-tenant por host).

## 5. Tenant e slug `vendas`

O primeiro label do host vira slug do tenant (exceto `*.vercel.app` e `www`). Em `vendas.menvedigital.com.br` o slug é **`vendas`**.

O seed Prisma cria o tenant `vendas` e o usuário `owner@vendas.menvedigital.local` (senha seed: `admin123` — **troque em produção**). Após o primeiro deploy com banco vazio:

```bash
cd menve-sales-api
# Com DATABASE_URL de produção no ambiente:
npx prisma db seed
```

## 6. Smoke test

Automatizado (requer URLs públicas):

```bash
npm run smoke:prod -- https://api.vendas.menvedigital.com.br https://vendas.menvedigital.com.br
```

Checklist manual: [`menve-sales-api/docs/SMOKE-CHECKLIST.md`](../menve-sales-api/docs/SMOKE-CHECKLIST.md).

## Ordem recomendada

1. Neon + variáveis `DATABASE_URL` / `DIRECT_URL`.
2. Deploy da API + domínio + `CORS_ORIGIN`.
3. Projeto Vercel + variáveis + deploy.
4. DNS `vendas` e subdomínio da API.
5. Seed (se necessário) e validação de login no tenant `vendas`.
6. WhatsApp: reaplicar webhooks conforme WHATSAPP-GOLIVE.
