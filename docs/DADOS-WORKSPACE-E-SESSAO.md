# Dados do workspace vs sessão (cookie)

## Fonte de verdade

- **CRM e estrutura do workspace** (tenant, contatos, deals, pipelines, inbox, conexões WhatsApp, memberships, etc.) ficam no **PostgreSQL**, acessados pela API Nest via Prisma (`menve-sales-api/prisma/schema.prisma`).
- **Cookie / JWT (Auth.js)** guarda só **sessão**: token de API, tenant ativo, lista resumida de workspaces para a UI. Não é onde o produto persiste dados de negócio.

**Logout, limpar cookies ou reduzir tamanho do JWT** (ex.: não embutir URLs de imagem no token) **não apagam** dados no banco. Na próxima autenticação, `GET /auth/me` e o restante da API recarregam a partir do Postgres.

O logo do workspace permanece em `Tenant.image` no banco; omitir `image` só no JWT evita cookies grandes (ex.: erro 494 na Vercel), sem alterar o registro do tenant.

## O que pode apagar dados de verdade

- Comandos ou scripts que executem `DELETE` em `Tenant`, `User` ou tabelas relacionadas.
- **Cascatas** do schema (ex.: `onDelete: Cascade`) ao remover usuário ou tenant.
- **Migrações** destrutivas mal revisadas ou restore de backup errado.
- Incidente no provedor do banco **sem** backup ou point-in-time recovery habilitado.

## Checklist Neon (produção) — backups e PITR

Execute no [console Neon](https://console.neon.tech) no projeto que serve `DATABASE_URL` de produção:

1. **Branches** — Confirmar qual branch é produção e se há branch de staging separada.
2. **Backups automáticos** — Em *Project settings* / documentação do plano: confirmar que backups contínuos ou snapshots estão ativos conforme o plano contratado.
3. **Point-in-time recovery (PITR)** — Se disponível no plano, anotar a **janela de retenção** (ex.: quantos dias é possível restaurar).
4. **Restore** — Saber onde acionar *Restore* / criar branch a partir de um ponto no tempo, antes de precisar em emergência.

Links úteis (Neon; podem mudar com o tempo):

- [Neon — Backup and restore](https://neon.tech/docs/manage/backups)
- [Neon — Branching](https://neon.tech/docs/guides/branching)

**Registro interno (preencher após revisão):**

| Data | Revisor | Plano Neon | PITR / retenção | Observações |
|------|---------|------------|-----------------|-------------|
|      |         |            |                 |             |
