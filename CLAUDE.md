# CLAUDE.md — Menve Sales

## Stack

`Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn` · `NestJS 11 + Prisma + Postgres` · `NextAuth` · `Evolution API / Meta Cloud (WhatsApp)` · `Vitest` · `Playwright`

## Convenções

- Monorepo: `menve-sales-web/` (porta 3000) e `menve-sales-api/` (porta 4000); Prisma em `menve-sales-api/prisma/`, client sincronizado no web no `postinstall`
- Mutações e dados sensíveis: **Server Actions** em `menve-sales-web/src/actions/` → API Nest ou `tenant-db.ts`; não misturar fetch client à API no mesmo fluxo sem critério
- UI: componentes em `menve-sales-web/src/components/ui/`; tokens de pipeline em `pipeline-ui-tokens.ts`
- Commits no padrão **conventional**; sem `any` solto em TypeScript

## Domínio

- `Tenant` = empresa no CRM (multi-tenant); sessão/header `x-tenant-id` definem o contexto ativo
- `Workspace` / `WorkspaceMembership` = acesso do usuário ao tenant com papel (`OWNER`, `ADMIN`, `MANAGER`, `SELLER`, …)
- `Pipeline` + `Stage` = funil; `Deal` = oportunidade na etapa; `Contact` = contato vinculado ao deal
- WhatsApp: providers via `IWhatsAppProvider` (`whatsapp/provider.interface.ts` + `factory.ts`)

## Proibido

- Alterar `schema.prisma` sem **migration** versionada em `menve-sales-api/prisma/migrations/`
- Usar `db:push` em **produção** (usar `migrate deploy`)
- Subir mudança estrutural sem alinhar com o fluxo de versionamento do time (commit + push quando aplicável)
