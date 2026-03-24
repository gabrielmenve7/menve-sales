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

### Checklist rápido

- [ ] HTTPS válido (certificado confiável) para o app e, em produção, para a Evolution.
- [ ] `EVOLUTION_BASE_URL` e `EVOLUTION_API_KEY` corretos no Menve.
- [ ] Firewall liberado para o tráfego do provedor Evolution (se aplicável).
- [ ] Mesma `EVOLUTION_API_KEY` no app e na API Evolution.
- [ ] `NEXT_PUBLIC_APP_URL` igual à URL que a Evolution usará para chamar o webhook.
- [ ] Teste: **Novo número** no Inbox → escanear QR → mensagem de teste → conversa no **Inbox**.

**Mensagens não aparecem no Inbox (webhook não chega):**

1. A Evolution precisa fazer `POST` em `NEXT_PUBLIC_APP_URL` a partir da internet. Se o Menve roda só em `http://localhost:3000`, o servidor da Evolution **não alcança** esse endereço — use um túnel (ngrok, Cloudflare Tunnel, etc.) ou publique o app com HTTPS e defina `NEXT_PUBLIC_APP_URL` com essa URL pública.

2. Instâncias criadas com **webhook por evento** (`webhookByEvents: true`) enviam para `.../connectionId/messages-upsert`. O Menve aceita essa URL (rota catch-all) e também registra novas conexões com **URL única** (`webhookByEvents: false`). Se ainda não receber, no Inbox use **Reaplicar webhook** (linha Evolution selecionada) para gravar de novo na Evolution a URL correta.

---

## Meta (Cloud API)

1. **App no Meta for Developers** — produto WhatsApp configurado.
2. **Verify token** — defina `META_VERIFY_TOKEN` igual ao configurado no painel do webhook.
3. **App secret** — `META_APP_SECRET` para validar assinatura `X-Hub-Signature-256` (se o código validar; conferir [`src/app/api/webhooks/whatsapp/meta`](../src/app/api/webhooks/whatsapp/meta)).
4. **URL do callback** — `https://app.seudominio.com/api/webhooks/whatsapp/meta`.
5. **Assine os campos** de mensagens/conversas necessários no painel Meta.

### Checklist rápido

- [ ] URL de callback com HTTPS.
- [ ] GET de verificação (challenge) retornando o `hub.challenge`.
- [ ] POST de eventos recebido com status 200.
- [ ] Teste de mensagem de exibição no Inbox.

---

## Ordem sugerida

1. Colocar o app no ar e validar `/api/health`.
2. Configurar Evolution **ou** Meta (um canal por vez simplifica debug).
3. Enviar mensagem de teste e confirmar no **Inbox** e nos logs do servidor.

Em caso de falha, verifique logs do Next.js, resposta HTTP do webhook (4xx/5xx) e se o `connectionId` na URL corresponde a um registro `WhatsAppConnection` existente.
