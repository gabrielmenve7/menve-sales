# Como destravar o login em produção (passo a passo)

Este documento descreve o que **precisa estar configurado** em cada serviço (Vercel + Railway + Neon) para o login do CRM funcionar. Use este checklist em vez de “tentar de novo”.

> **Fluxo do login**: browser → `POST /api/auth/callback/credentials` (Next/Vercel) → `POST ${INTERNAL_API_URL}/auth/login` (server-side, Vercel → Railway) → Postgres (Neon) via Prisma.

---

## 0. Diagnóstico rápido

Depois do redeploy desta versão, chame a rota de diagnóstico do próprio site usando o seu `INTERNAL_API_KEY`:

```bash
curl -sS -X POST \
  -H "x-diag-key: <SEU_INTERNAL_API_KEY>" \
  https://mnvsales.vercel.app/api/_diag/auth-bridge | jq
```

A resposta mostra:
- Se `INTERNAL_API_URL` está definido, com qual `origin` e `pathname`.
- Status de `GET /health`, `GET /health/live`, `POST /auth/login`, `GET /auth/me` contra essa base.
- Campo `verdict` com a causa mais provável do problema (URL errada, 5xx, etc).

> Se você já não tem mais o `INTERNAL_API_KEY` original, basta gerar um novo e aplicar igual nos dois hosts (Vercel + Railway). Veja a seção 4.

---

## 1. Neon (banco)

Use **um único projeto/banco** para tudo (API e Next). Recomendado: o banco que a API já usa (atualmente `ep-crimson-frog-acsw125p`, ver `menve-sales-api/.env`).

Você precisará de **dois connection strings**:
- `DATABASE_URL`: com `-pooler` no host (para o runtime).
- `DIRECT_URL`: **sem** `-pooler` no host, mesmo banco (para o `prisma migrate deploy` no build da Vercel).

Ex.:
```
DATABASE_URL=postgresql://USER:PASS@ep-crimson-frog-acsw125p-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DIRECT_URL=postgresql://USER:PASS@ep-crimson-frog-acsw125p.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Aplique esse **mesmo par** em **Vercel** e **Railway**.

---

## 2. Railway (API Nest)

No projeto da API:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | URL Neon **com pooler** |
| `DIRECT_URL` | URL Neon **sem pooler** |
| `JWT_SECRET` | **Obrigatório em produção.** Gere com `openssl rand -base64 48`. Sem ele, a API agora **não sobe** (commit `213a2485`). |
| `INTERNAL_API_KEY` | Igual à Vercel. Gere com `openssl rand -base64 32`. |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://mnvsales.vercel.app` (ou domínios separados por vírgula) |
| `PUBLIC_APP_URL` | URL pública da API (a própria do Railway) |
| `USE_WORKSPACE_MEMBERSHIP` | `true` se já fez backfill; `false` caso contrário |

Confirme que a URL pública da Railway está exposta e responde:
```bash
curl -i https://<sua-api>.up.railway.app/health
# esperado: 200 + {"ok":true,"db":"up",...}
curl -i -X POST -H "Content-Type: application/json" \
  -d '{"email":"x@y","password":"bad"}' \
  https://<sua-api>.up.railway.app/auth/login
# esperado: 401 (credenciais inválidas)
```

Se `/health` retornar 200 mas `/auth/login` retornar 404, o serviço da Railway está numa **versão antiga** do código — faça redeploy do `master`.

---

## 3. Vercel (Next)

Em **Project → Settings → Environment Variables** (Production e Preview):

| Variável | Valor |
|----------|-------|
| `INTERNAL_API_URL` | URL **exata** do Railway, **sem barra no final** e **sem `/api`**. Ex.: `https://menve-sales-production.up.railway.app` |
| `INTERNAL_API_KEY` | **Mesmo** valor do Railway |
| `DATABASE_URL` | URL Neon **com pooler** |
| `DIRECT_URL` | URL Neon **sem pooler** |
| `NEXTAUTH_URL` | `https://mnvsales.vercel.app` (ou seu domínio) |
| `NEXTAUTH_SECRET` | Igual ao usado hoje (ou regenere com `openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | mesma do `NEXTAUTH_URL` |

⚠️ Erros comuns a evitar:
- **NÃO** colocar `/api` no fim do `INTERNAL_API_URL`. O código já adiciona `/auth/login`. Se colocar `/api`, vira `/api/auth/login`, que **não existe** na API (Nest não usa global prefix) — daí o 404 que você está vendo na tela.
- **NÃO** apontar `INTERNAL_API_URL` para o próprio site (`https://mnvsales.vercel.app`) — isso causa loop / 404.
- Sem `INTERNAL_API_URL`, o Next em produção tenta `http://localhost:4000` e falha.

Após salvar, faça **Redeploy** (botão Redeploy no último deploy de Production).

---

## 4. Sincronizar `INTERNAL_API_KEY`

Esse segredo precisa ser **idêntico** nos dois lados:

```bash
# Gere uma chave forte
openssl rand -base64 32
# Aplique em:
# - Vercel (Production env): INTERNAL_API_KEY
# - Railway (env do serviço da API): INTERNAL_API_KEY
# Redeploy nos dois
```

Se forem diferentes, todas as ações server-to-server (cadastro, settings) quebram.

---

## 5. Validação pós-deploy

1. **Health-check direto da API** (Railway):
   ```bash
   curl -i https://<sua-api>.up.railway.app/health
   ```
   → `200` com `db:"up"`.

2. **Health-check via Next** (Vercel):
   ```bash
   curl -i https://mnvsales.vercel.app/api/health
   ```
   → `200` com `db:"up"`.

3. **Diagnóstico da ponte** (precisa do `INTERNAL_API_KEY`):
   ```bash
   curl -sS -X POST -H "x-diag-key: <KEY>" \
     https://mnvsales.vercel.app/api/_diag/auth-bridge | jq
   ```
   - `env.INTERNAL_API_URL.origin` → deve ser o host do Railway.
   - `env.INTERNAL_API_URL.pathname` → deve ser `""` (vazio).
   - `probes[2].status` → `401` (login com senha inválida = sucesso da ponte).
   - `verdict` → vazio ou só mensagens informativas.

4. **Login real** em `https://mnvsales.vercel.app/login`.

---

## 6. Comandos úteis

```bash
# Verificar local (.env atual)
node menve-sales-api/scripts/validate-auth-bridge.mjs

# Verificar a API pública diretamente:
VALIDATE_AUTH_BRIDGE_BASE=https://<sua-api>.up.railway.app \
  node menve-sales-api/scripts/validate-auth-bridge.mjs
```

---

## 7. Se ainda falhar

- Abra **Vercel → Deployments → ver Function Logs** durante uma tentativa de login. Os logs do nosso código têm a tag `[menve/auth] auth/login não OK:` com **status HTTP** e **URL chamada**. Isso identifica imediatamente se `INTERNAL_API_URL` está apontando para o lugar errado.
- Abra **Railway → Deployments → Logs** para ver erros de Prisma / JWT / banco no momento do POST.
