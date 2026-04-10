# WhatsApp — Go-live (MVP)

Pré-requisito comum: URL pública **HTTPS** acessível pela internet (Evolution na VPS ou Meta Cloud API).

---

## Evolution API

1. **URL pública do app** — ex.: `https://app.seudominio.com` em `NEXT_PUBLIC_APP_URL` (o Menve monta o webhook com esse prefixo).
2. **URL da Evolution** — `EVOLUTION_BASE_URL` (ex.: `https://evolution.seudominio.com` ou `http://localhost:8080` no docker-compose local).
3. **API key** — o mesmo valor em:
   - variáveis `EVOLUTION_BASE_URL` + `EVOLUTION_API_KEY` no Menve / `.env`;
   - configuração da Evolution (`AUTHENTICATION_API_KEY` no compose ou painel).
4. **Webhook automático (Inbox)** — ao usar **Novo número** no Inbox, o Menve cria o registro `WhatsAppConnection`, depois a instância na Evolution com webhook já apontando para:
   - `POST <NEXT_PUBLIC_APP_URL>/api/webhooks/whatsapp/evolution/<connectionId>`
   - Não é necessário cadastrar o webhook manualmente nesse fluxo.
5. **Webhook manual (alternativo)** — se você criar a instância só na Evolution, configure o POST para o mesmo path, com `<connectionId>` = `WhatsAppConnection.id` no banco.
6. **`SERVER_URL` na Evolution** — deve ser a URL **pública** onde a Evolution está exposta (não `http://localhost:8080` em produção), alinhada ao túnel/domínio que o WhatsApp/Evolution usam.
7. **Segredo opcional** — `EVOLUTION_WEBHOOK_SECRET`: defina no Menve e configure o header correspondente no webhook da Evolution (`x-webhook-secret`), conforme o handler em `src/app/api/webhooks/whatsapp/evolution/[connectionId]/route.ts`.
8. **Filtro de grupos no Inbox** — `WHATSAPP_ALLOW_GROUPS` controla se mensagens de grupo entram no Menve:
   - `false` (padrão): só mensagens 1:1
   - `true`: permite também grupos (`@g.us`)

### Checklist rápido

- [ ] HTTPS válido (certificado confiável) para o app e, em produção, para a Evolution.
- [ ] `EVOLUTION_BASE_URL` e `EVOLUTION_API_KEY` corretos no Menve.
- [ ] Firewall liberado para o tráfego do provedor Evolution (se aplicável).
- [ ] Mesma `EVOLUTION_API_KEY` no app e na API Evolution.
- [ ] `NEXT_PUBLIC_APP_URL` igual à URL que a Evolution usará para chamar o webhook.
- [ ] Se `EVOLUTION_WEBHOOK_SECRET` estiver ativo, validar 401 sem header e 200 com header correto.
- [ ] Teste: **Novo número** no Inbox → escanear QR → mensagem de teste → conversa no **Inbox**.

**Mensagens não aparecem no Inbox (webhook não chega):**

1. A Evolution precisa fazer `POST` em `NEXT_PUBLIC_APP_URL` a partir da internet. Se o Menve roda só em `http://localhost:3000`, o servidor da Evolution **não alcança** esse endereço — use um túnel (ngrok, Cloudflare Tunnel, etc.) ou publique o app com HTTPS e defina `NEXT_PUBLIC_APP_URL` com essa URL pública.

2. Instâncias criadas com **webhook por evento** (`webhookByEvents: true`) enviam para `.../connectionId/messages-upsert`. O Menve aceita essa URL (rota catch-all) e também registra novas conexões com **URL única** (`webhookByEvents: false`). Se ainda não receber, no Inbox use **Reaplicar webhook** (linha Evolution selecionada) para gravar de novo na Evolution a URL correta.

---

## Meta (Cloud API) — API Nest (`menve-sales-api`)

O webhook é servido pela **API Nest**, não pelo Next.js. Use a mesma base pública que `PUBLIC_APP_URL` (HTTPS em produção).

1. **App no Meta for Developers** — produto WhatsApp configurado.
2. **Verify token** — `META_VERIFY_TOKEN` no `.env` da API deve ser **idêntico** ao “Verify token” do webhook no painel Meta. O assistente em **Configurações → Canais → WhatsApp Official** exibe o valor para copiar (usuário autenticado com permissão de configurar tenant).
3. **App secret** — com `META_APP_SECRET` definido, o `POST /webhooks/whatsapp/meta` exige o header `X-Hub-Signature-256` válido (HMAC-SHA256 do **corpo bruto** JSON). O `json()` do Express grava o buffer em `req.rawBody` só nessa rota (`main.ts`).
4. **URL do callback** — `{PUBLIC_APP_URL}/webhooks/whatsapp/meta` (ex.: `https://api.seudominio.com/webhooks/whatsapp/meta`).
5. **Assine o campo** `messages` (mínimo para o Inbox).
6. **Multi-tenant** — cada evento traz `metadata.phone_number_id`; a API resolve `WhatsAppConnection` com `config.phoneNumberId` correspondente (vários clientes no mesmo app Meta).
7. **Embedded Signup** — opcional: `META_EMBEDDED_SIGNUP_CLIENT_ID` + `META_EMBEDDED_SIGNUP_REDIRECT_URI`; `GET /whatsapp-connections/meta-embedded-signup-info` retorna a URL de OAuth. A troca `code → token` (`POST /whatsapp-connections/meta/oauth-exchange`) é placeholder até o app estar aprovado e o fluxo implementado.

### Checklist rápido

- [ ] `PUBLIC_APP_URL` com HTTPS e igual à URL usada no painel Meta.
- [ ] GET de verificação (`hub.verify_token` / `hub.challenge`) retornando o challenge em texto puro.
- [ ] `META_APP_SECRET` em produção + assinaturas válidas nos POST.
- [ ] POST de eventos com status 200; logs da API: `meta webhook connectionId=… parsed=… processed=…`.
- [ ] Teste de mensagem no Inbox; **Testar** na lista de canais ou após o assistente chama a Graph no Phone Number ID.

---

## Ordem sugerida

1. Colocar o app no ar e validar `/api/health`.
2. Configurar Evolution **ou** Meta (um canal por vez simplifica debug).
3. Enviar mensagem de teste e confirmar no **Inbox** e nos logs do servidor.

Em caso de falha, verifique logs do Next.js, resposta HTTP do webhook (4xx/5xx) e se o `connectionId` na URL corresponde a um registro `WhatsAppConnection` existente.

### Probe manual do webhook (opcional)

Use para validar rapidamente conectividade e segredo:

```bash
curl -i -X POST "https://SEU_APP/api/webhooks/whatsapp/evolution/SEU_CONNECTION_ID" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: SEU_SECRET" \
  -d '{"data":{"messages":[{"key":{"id":"probe-1","remoteJid":"5511999999999@s.whatsapp.net","fromMe":false},"message":{"conversation":"ping"},"messageTimestamp":1710000000}]}}'
```

Esperado: `200` com `{"ok":true,...}` quando `connectionId` existe e o segredo está correto.

Também é possível rodar um smoke test automatizado:

```bash
npm run whatsapp:golive-check
```

Para validar autenticação de webhook com segredo, defina `WHATSAPP_CONNECTION_ID` no ambiente antes de executar.

Para validar o pipeline local (persistência) de ponta a ponta:

```bash
npm run whatsapp:inbound-e2e
npm run whatsapp:outbound-e2e
```

## Backlog de hardening (priorizado)

- **P0 — Idempotência forte:** evoluir de deduplicação em aplicação para restrição única em banco por conexão + `externalId` com estratégia de migração segura para dados legados.
- **P0 — Segurança de webhook:** manter `EVOLUTION_WEBHOOK_SECRET` obrigatório em produção e adicionar rotação de segredo com janela de transição.
- **P1 — Observabilidade:** centralizar logs estruturados do receiver (status, duplicata, erro) e criar alerta para taxa de falha de webhook.
- **P1 — Operação:** checklist de troubleshooting com ações rápidas (reaplicar webhook, validar URL pública, verificar segredo, revalidar conexão).
