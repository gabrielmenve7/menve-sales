---
name: Header deal editável (escopo atualizado)
overview: Status muda etapa do funil (como ClickUp); responsável editável via usuários do tenant; datas só criação (fixo); remover Prioridade, Rastrear tempo e Estimativa de tempo da UI.
todos:
  - id: api-deal-assignee
    content: Nest PATCH /deals/:id com assignedToId (null ou user do tenant) + validação membro
  - id: web-action-assignee
    content: Server action updateDealAssignee (ou patch parcial) + reload/refresh no modal
  - id: ui-stage-dropdown
    content: Dropdown/popover no pill Status com estágios do pipeline + moveDealStage existente
  - id: ui-assignee-select
    content: Select/popover Responsáveis com tenantMembers (inclui o próprio usuário)
  - id: ui-datas-fixo
    content: Mostrar apenas data de criação (createdAt), sem expectedClose na UI
  - id: ui-remove-rows
    content: Remover blocos Prioridade, Rastrear tempo, Estimativa de tempo do pipeline-deal-detail-dialog
---

# Plano: header do deal (escopo acordado)

## Objetivo do produto

- **Status**: trocar **etapa do funil** no próprio card, no estilo ClickUp (lista de estágios do pipeline atual).
- **Responsáveis**: escolher entre **usuários cadastrados no tenant** (incluindo o usuário logado); hoje não edita porque não há API/UI — precisa de **persistência** `assignedToId`.
- **Datas**: **somente data de criação**, fixa (somente leitura); não editar `expectedClose` nesta entrega.
- **Remover do layout**: **Prioridade**, **Rastrear tempo**, **Estimativa de tempo**.

## Backend (API)

- **`PATCH /deals/:id`** (parcial mínimo para esta entrega) com pelo menos:
  - `assignedToId`: `string | null` — validar que o user pertence ao mesmo `tenantId` (mesma regra do campo custom USER).
- **Estágio**: já existe **`PATCH /deals/:id/stage`** + [`moveDealStage`](menve-sales-web/src/actions/deals.ts) — **reutilizar**, sem novo endpoint obrigatório.
- **Não** incluir nesta entrega: `probability`, campos de tempo/estimativa, nem mudança de `expectedClose` pela UI.

Arquivos principais: [`menve-sales-api/src/deals/deals.controller.ts`](menve-sales-api/src/deals/deals.controller.ts), [`menve-sales-api/src/deals/deals.service.ts`](menve-sales-api/src/deals/deals.service.ts).

## Web

- Nova server action (ex.: `updateDealAssignee` ou `patchDeal`) em [`menve-sales-web/src/actions/deals.ts`](menve-sales-web/src/actions/deals.ts) chamando o PATCH, com `revalidatePath` pipeline/contatos.
- Modal [`pipeline-deal-detail-dialog.tsx`](menve-sales-web/src/app/(dashboard)/pipeline/pipeline-deal-detail-dialog.tsx):
  - **Pill Status** (topo + área Status): abrir **popover/select** com estágios ordenados de `d.pipeline.stages`; ao escolher → `moveDealStage(d.id, stageId)` → `reload()` + `router.refresh()`.
  - **Responsáveis**: componente tipo select (padrão já usado em custom field USER) com `tenantMembers`; opção vazia para limpar; ao mudar → action de `assignedToId`.
  - **Datas**: uma linha só, texto **“Criado em …”** (`createdAt` formatado pt-BR).
  - **Remover** nós `MetaBlock` (ou equivalentes) de Prioridade, Rastrear tempo, Estimativa de tempo.

## Fora deste escopo (mantido no backlog geral)

- PATCH de `deal.title`, contato nome/empresa, tags no modal, troca de pipeline/funil.
- Estimativa e rastreamento de tempo até existir modelo de dados.

## Ordem sugerida de implementação

1. API `assignedToId` + action web.  
2. UI responsável + remoção das três linhas + datas fixas.  
3. UI dropdown de estágio ligada a `moveDealStage`.
