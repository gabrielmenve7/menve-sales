# Deploy MVP — Menve Sales

Recomendação para o primeiro go-live: **Path A (PaaS)** — menos manutenção, TLS e escala geridos pelo provedor. **Path B (VPS + Docker)** quando você precisa rodar Evolution na mesma máquina ou controle total do host.

---

## Path A — PaaS (ex.: Vercel + Neon)

### Por que Path A no MVP

- Build oficial do Next.js no edge da plataforma.
- Postgres gerenciado (Neon, Supabase, Railway Postgres) com backup e conexão TLS.
- Sem gerenciar certificados no servidor do app.

### Repositório Git e Vercel

1. Crie um repositório no GitHub (ou GitLab/Bitbucket). No clone local com commits: `git remote add origin <url-do-repo>` e `git push -u origin main` (ou `master`, conforme o branch padrão).
2. Em [vercel.com](https://vercel.com): **Add New… → Project** → importe o repositório.
3. **Environment Variables:** configure todas as variáveis da tabela abaixo (Production). `DATABASE_URL` deve estar presente **antes** do build (a migração roda no build).
4. Faça o primeiro deploy. A URL será `https://<nome-do-projeto>.vercel.app` (ou domínio customizado).

### Build e start

- **Local / Docker:** `npm run build` (= `prisma generate && next build`). Em Docker, `prisma migrate deploy` roda no [entrypoint](../docker-entrypoint.sh) na subida do container.
- **Vercel:** o arquivo [`vercel.json`](../vercel.json) define o comando de build como `prisma generate && prisma migrate deploy && next build`, para aplicar migrações no Postgres de produção durante o deploy.

No painel da Vercel (valores padrão costumam bastar):

| Configuração | Valor típico |
|----------------|--------------|
| Install | `npm install` ou `npm ci` |
| Build | *(sobrescrito por `vercel.json`)* |
| Output | Next.js (detecção automática) |

### Banco em produção

1. Crie o banco Postgres (ex.: Neon) e copie a URL **com SSL** (`?sslmode=require` ou string fornecida pelo provedor).
2. Na Vercel, com `DATABASE_URL` configurado, cada deploy executa **`prisma migrate deploy`** no build (via `vercel.json`).
3. Rode seed em produção apenas de forma explícita e controlada (`npx prisma db seed`), não automaticamente no build.

**Não use `db push` em produção** — use apenas migrações versionadas em [`prisma/migrations`](../prisma/migrations).

### Variáveis de ambiente (produção)

Ver [`.env.example`](../.env.example). Mínimo na Vercel (Environment Variables → Production):

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Postgres com TLS (URL do Neon/Supabase etc.) |
| `NEXTAUTH_SECRET` | ≥ 32 caracteres aleatórios (não reutilizar o de desenvolvimento) |
| `NEXTAUTH_URL` | URL canônica **https** do app (`https://<projeto>.vercel.app` ou domínio próprio) |
| `NEXT_PUBLIC_APP_URL` | **Igual** a `NEXTAUTH_URL` (webhooks Evolution e links públicos) |
| `DEFAULT_TENANT_SLUG` | Ex.: `demo` — deve existir no banco após seed/migração inicial |
| `EVOLUTION_BASE_URL` | URL pública da API Evolution |
| `EVOLUTION_API_KEY` | Mesmo `apikey` da Evolution |
| `EVOLUTION_WEBHOOK_SECRET` | Opcional; se preenchido, alinhar com a Evolution |

Opcional: `AUTH_URL` — espelho de `NEXTAUTH_URL` em alguns hosts (Auth.js v5).

### Healthcheck

Monitore `GET https://seu-dominio/api/health` — esperado `200` e `{ "ok": true, "db": "up", ... }`.

---

## Path B — VPS + Docker

### Quando usar

- Evolution API na mesma VPS, ou
- requisitos de compliance / rede privada.

### Arquivos

- [`Dockerfile`](../Dockerfile) — imagem do app Next + `prisma migrate deploy` na subida.
- [`docker-compose.prod.yml`](../docker-compose.prod.yml) — exemplo: app + Postgres (ajuste segredos e volumes).

### Build local da imagem

```bash
docker build -t menve-sales:latest .
```

### Subir stack de exemplo

```bash
cp .env.example .env
# Edite DATABASE_URL para apontar para o serviço postgres do compose (host = postgres)
docker compose -f docker-compose.prod.yml up -d
```

Coloque um reverse proxy (Caddy, Traefik ou Nginx) na frente com TLS (Let’s Encrypt) e encaminhe para a porta do container `app`.

### Comando de produção no container

O entrypoint executa `prisma migrate deploy` e em seguida `next start`.

---

## DNS, TLS e multi-tenant (subdomínio)

O middleware resolve tenant pelo **subdomínio** do `Host` ([`src/lib/tenant-edge.ts`](../../menve-sales-web/src/lib/tenant-edge.ts)): `acme.seudominio.com` → slug `acme`.

### Checklist

1. **DNS**
   - Registro A/AAAA do apex (`seudominio.com`) para o IP do provedor **ou** CNAME para o host do PaaS.
   - Se usar subdomínios por tenant: registro **wildcard** `*.seudominio.com` → mesmo destino (ou CNAME wildcard conforme o provedor).

2. **TLS**
   - No Path A, o provedor emite o certificado.
   - No Path B, use ACME (Caddy/Traefik/Let’s Encrypt no Nginx).

3. **Teste rápido sem DNS local**

   ```bash
   curl -s -o /dev/null -w "%{http_code}" -H "Host: demo.localhost" http://127.0.0.1:3000/login
   ```

   Em produção, teste com o domínio real: abra `https://slug.seudominio.com/login` após criar o tenant com `slug` correspondente.

4. **`DEFAULT_TENANT_SLUG`**
   - Quando não há subdomínio (ex.: acesso só pelo apex), o fallback usa `DEFAULT_TENANT_SLUG` — deve existir um tenant com esse slug no banco (o seed demo costuma criar `demo`).

---

## Ordem sugerida no primeiro deploy

1. Criar banco e definir `DATABASE_URL` no painel (Vercel) **antes** do primeiro build com sucesso.
2. **Vercel:** o build já roda `prisma migrate deploy` ([`vercel.json`](../vercel.json)). **Docker/Path B:** migrate no entrypoint ou manualmente uma vez.
3. Opcional: popular dados iniciais — com `DATABASE_URL` de produção no ambiente local: `npx prisma db seed` (ou apenas staging no primeiro go-live controlado).
4. Configurar demais variáveis no host e fazer deploy do app.
5. Validar `GET /api/health` e login.
6. WhatsApp Evolution: com `NEXT_PUBLIC_APP_URL` apontando para a URL pública do deploy, no Inbox usar **Reaplicar webhook** na linha Evolution (ou parear de novo). Detalhes em [`WHATSAPP-GOLIVE.md`](./WHATSAPP-GOLIVE.md).

### Pós-deploy rápido (Vercel + Evolution)

- Confirme que `NEXTAUTH_URL` e `NEXT_PUBLIC_APP_URL` são **https** e iguais à URL que a Evolution deve chamar.
- Abra o Inbox → selecione a conexão Evolution → **Reaplicar webhook** uma vez após o primeiro deploy estável.
