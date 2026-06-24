# Migração Evolution → Zappfy

## Resumo

A Zappfy API (`https://api.zappfy.io`) usa autenticação por **token de instância** (header `token`) e **admintoken** para operações administrativas (criar instância).

## Mapeamento Evolution → Zappfy

| Operação Menve | Evolution | Zappfy |
|----------------|-----------|--------|
| Criar instância | `POST /instance/create` + apikey | `POST /instance/init` + admintoken |
| QR / pairing | `GET /instance/connect/{name}` | `POST /instance/connect` + token |
| Status | `GET /instance/connectionState/{name}` | `GET /instance/status` + token |
| Enviar texto | `POST /message/sendText/{instance}` | `POST /send/text` + token |
| Enviar mídia | `POST /message/sendMedia/{instance}` | `POST /send/media` + token |
| Webhook | `POST /webhook/set/{instance}` | `POST /webhook` + token — body `{ url, events: ["messages"], excludeMessages: ["wasSentByApi"], enabled: true }` |
| Baixar mídia inbound | `POST /chat/getBase64FromMediaMessage/{instance}` | `POST /chat/getBase64FromMediaMessage` + token |
| Webhook inbound | `MESSAGES_UPSERT` | `messages` (simples) ou `NEW-MESSAGE` (proto Baileys) |

## Formatos de webhook suportados

### Formato simples (api.zappfy.io)

```json
{
  "event": "messages",
  "data": {
    "messageId": "...",
    "from": "5511999999999",
    "text": "olá",
    "fromMe": false,
    "timestamp": 1710000000000
  }
}
```

### Formato NEW-MESSAGE (painel Zapfy / proto)

```json
{
  "type": "NEW-MESSAGE",
  "data": {
    "key": {
      "remoteJid": "5527997320619@s.whatsapp.net",
      "fromMe": false,
      "id": "BAE5DA285CEE647A"
    },
    "message": {
      "audioMessage": {
        "url": "https://.../arquivo.m4a",
        "mimetype": "audio/mp4",
        "ptt": true
      }
    },
    "messageTimestamp": { "low": 1674326566, "high": 0 }
  }
}
```

Áudio sem legenda vira corpo `[Áudio]` com `mediaUrl` quando a URL vem no payload.

Eventos `MESSAGE-UPDATED` são ignorados (só status de entrega).

## NormalizedInbound

| Campo | Zappfy |
|-------|--------|
| externalId | `data.key.id` ou `data.messageId` |
| from | dígitos de `key.remoteJid` / `data.from` |
| body | `data.text` ou placeholder `[Áudio]` / `[Imagem]` |
| mediaUrl | `audioMessage.url` (HTTPS) ou base64 no payload |
| fromMe | `data.key.fromMe` |
| timestamp | `messageTimestamp` (número ou `{ low, high }`) |

## Variáveis de ambiente

```env
PUBLIC_APP_URL=https://sua-api.up.railway.app   # URL pública da API Nest (não Vercel)
ZAPPFY_BASE_URL=https://api.zappfy.io
ZAPPFY_ADMIN_TOKEN=...                          # só para QR / criar instância
ZAPPFY_WEBHOOK_SECRET=...                       # opcional; header x-webhook-secret ou ?webhook_secret= na URL
```

## Configuração do painel Zappfy

Espelhe estas opções no painel (ou use só **Reaplicar webhook** no Menve — não alterne os dois sem salvar):

| Painel Zappfy | Valor esperado |
|---------------|----------------|
| URL base | `PUBLIC_APP_URL` da API Railway (ex.: `https://menve-sales-production.up.railway.app`) |
| Path | `/webhooks/whatsapp/zappfy/{connectionId}` |
| Webhook ativo | Sim |
| Adicionar eventos/tipos na URL | **Desligado** |
| Evento `messages` | Marcado |
| Ignorar «Enviadas pela API» | Marcado (`wasSentByApi`) |
| Ignorar grupos | Marcado se `WHATSAPP_ALLOW_GROUPS` não for `true` (`isGroupYes`) |
| Demais filtros «Ignorar» | Desmarcados (inbound de terceiros deve passar) |

O Menve registra via API o mesmo body: `events: ["messages"]`, `excludeMessages: ["wasSentByApi", ...]`, `enabled: true`, `webhookByEvents: false`.

**Secret:** o painel não expõe headers custom. Se `ZAPPFY_WEBHOOK_SECRET` estiver no Railway, «Reaplicar webhook» grava a URL com `?webhook_secret=...`; a API aceita secret no header **ou** na query.

## Webhook Menve

`POST {PUBLIC_APP_URL}/webhooks/whatsapp/zappfy/{connectionId}`

O `{connectionId}` é o ID da linha em `WhatsAppConnection` no Menve. Se recriar o canal, a URL muda — use **Reaplicar webhook** em Configurações → Canais.

## Checklist go-live (Zappfy → Atendimento)

1. **Railway (API):** `PUBLIC_APP_URL` = URL estável da API (`*.up.railway.app`), não ngrok nem Vercel.
2. **Instância:** conectada no painel Zappfy (QR escaneado); token da instância vinculado em Canais.
3. **Webhook:** em Canais, conferir URL exibida e clicar **Reaplicar webhook na Zappfy**.
4. **Secret:** se `ZAPPFY_WEBHOOK_SECRET` estiver na API, use **Reaplicar webhook** (URL com `?webhook_secret=`) — o painel Zappfy não suporta header custom.
5. **Teste texto:** enviar mensagem de **texto** (não só áudio) para o número conectado.
6. **Teste áudio:** enviar áudio; deve aparecer como `[Áudio]` com player se a URL/base64 vier no webhook.
7. **Logs Railway:** ao receber mensagem, buscar `zappfy webhook recv` (evento/fromMe/remoteJid) e depois `parsed=1 processed=1`.
8. **UI Canais:** **Testar webhook** deve retornar HTTP 200; **Último webhook** deve atualizar o horário.
9. **Script CLI:** `npx tsx scripts/zappfy-golive-check.ts <connectionId> [instanceToken]`
10. **Tenant:** usuário logado no mesmo workspace do canal (`x-tenant-id`).

### Após deploy — reteste operacional

1. Canais → **Reaplicar webhook na Zappfy** (não editar URL manualmente depois).
2. Confirmar instância **conectada** no painel Zappfy.
3. Enviar **texto** do celular para o número vinculado à instância.
4. Logs Railway no horário do envio:
   - **Nenhum** `zappfy webhook recv` → Zappfy não entrega; salvar painel ou suporte Zappfy.
   - **`parsed=0`** → copiar `rejectReason` do log e ajustar parser.
   - **`parsed=1 processed=1`** → mensagem deve aparecer no Atendimento.
5. Apagar conversas de probe (`5511999999999`, `5511888888888`) se ainda visíveis.

### Se o Inbox continuar vazio

| Sintoma nos logs | Ação |
|------------------|------|
| Nenhum log `zappfy webhook` | Webhook não chega na API — URL errada, secret 401, ou Zappfy não entregando |
| `parsed=0` com blobs > 0 | Payload diferente — copiar body do log e ajustar parser |
| `parsed=1` mas Inbox vazio | Tenant/workspace errado ou filtro na UI |
| Só áudio falha | Antes da correção: parser ignorava áudio sem texto |

## Runbook tenant piloto

1. Configurar `ZAPPFY_*` e `PUBLIC_APP_URL` na API
2. Canais → Zappfy → vincular token ou QR
3. Reaplicar webhook
4. `npx tsx scripts/zappfy-golive-check.ts <connectionId> <instanceToken>`
5. Teste envio/recebimento no Atendimento (texto + áudio)
6. Desativar conexão Evolution após soak de 7 dias
