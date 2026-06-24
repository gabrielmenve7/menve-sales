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
| Webhook | `POST /webhook/set/{instance}` | `POST /webhook` + token — body `{ url, events: ["messages"], excludeMessages: ["wasSentByApi"], enabled: true }` |
| Webhook inbound | `MESSAGES_UPSERT` | evento `messages` com payload `data` |

## NormalizedInbound

| Campo | Zappfy (esperado) |
|-------|-------------------|
| externalId | `data.messageId` ou `data.id` |
| from | `data.from` ou `data.chatId` (digits) |
| body | `data.text` ou `data.body` |
| fromMe | `data.fromMe === true` |
| timestamp | `data.timestamp` (ms ou s) |

## Variáveis de ambiente

```env
ZAPPFY_BASE_URL=https://api.zappfy.io
ZAPPFY_ADMIN_TOKEN=...
ZAPPFY_WEBHOOK_SECRET=...  # opcional; header x-webhook-secret
```

## Webhook Menve

`POST {PUBLIC_APP_URL}/webhooks/whatsapp/zappfy/{connectionId}`

## Runbook tenant piloto

1. Configurar `ZAPPFY_*` na API
2. `/whatsapps` → Nova conexão Zappfy
3. Escanear QR
4. `npx tsx scripts/zappfy-golive-check.ts <connectionId>`
5. Teste envio/recebimento no Inbox
6. Desativar conexão Evolution após soak de 7 dias
