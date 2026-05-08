# Extensão de navegador — Menve no WhatsApp Web

Veja também o guia rápido em [`menve-sales-extension/README.md`](../menve-sales-extension/README.md).

## Objetivo

Exibir um **painel lateral** (Chrome Side Panel) com **cadastro de contato e oportunidades** do Menve Sales enquanto o vendedor usa o **WhatsApp Web**, sem embutir o WhatsApp dentro do CRM.

## Componentes

| Peça | Função |
|------|--------|
| **API** `GET /contacts/resolve?phone=` | Resolve contato no tenant do JWT comparando apenas **dígitos** do campo `phone` no banco (robusto a máscaras). |
| **Extensão MV3** | Content script lê o chat pela URL; background grava último número no `chrome.storage`; side panel chama a API com `Authorization: Bearer`. |
| **Opções** | URL da API Nest, JWT e (opcional) URL base do CRM para link “Abrir no CRM”. |

## Autenticação (JWT + workspace)

1. O usuário faz login no Menve (fluxo normal) e garante o **workspace ativo** desejado (troca de tenant/workspace conforme o produto).
2. Obtém um **JWT** aceito pela API no header `Authorization: Bearer` (mesmo contrato do [`AppAuthGuard`](../menve-sales-api/src/common/app-auth.guard.ts)).
3. Cola o token na página **Opções** da extensão e informa a URL pública da API (ex.: Railway).

**Renovação:** quando o JWT expirar, o painel passará a receber HTTP 401/403 — o usuário deve colar um token novo. Evoluções futuras: fluxo OAuth próprio ou endpoint de refresh dedicado à extensão.

**Segurança:** o token fica em `chrome.storage.local` no perfil do navegador; trate o perfil como sensível. Para produção, considere restringir `host_permissions` no `manifest.json` ao domínio fixo da API em vez de `<all_urls>`.

## WhatsApp Web — fragilidade da integração

O WhatsApp Web **não expõe API estável**. A extensão **não depende de seletores CSS** no DOM do chat; ela tenta extrair o peer a partir da **URL** (`…/chat/<jid>`).

### Quando pode falhar

- Meta alterar o formato de URL ou o roteamento SPA.
- Contatos só em **lista arquivada / Loja / Beta** com URLs diferentes.
- **Grupos** (`@g.us`): não há um único telefone de lead — o painel informa isso explicitamente.

### Plano de manutenção recomendado

1. **Smoke manual** após mudanças visíveis do WhatsApp Web: abrir conversa 1:1 e confirmar que o painel recebe dígitos (Inspecionar → Application → Storage da extensão ou observar requisição `GET /contacts/resolve`).
2. **Fallback humano:** se a URL não trouxer JID, documentar para o time usar o CRM direto ou colar o número na busca de contatos.
3. **Evolução:** segunda linha de extração opcional (MutationObserver em cabeçalho / `document.title`) — só se a URL deixar de bastar; duplicar heurísticas aumenta custo de manutenção.

## Referência de endpoint

- **GET** `/contacts/resolve?phone=<qualquer formato ou só dígitos>`
- **Headers:** `Authorization: Bearer <jwt>`
- **Resposta:** `{ found: false, normalizedDigits }` ou `{ found: true, contact: { … }, normalizedDigits }`

Consulte o controller em [`contacts.controller.ts`](../menve-sales-api/src/contacts/contacts.controller.ts).
