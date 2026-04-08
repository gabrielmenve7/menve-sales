# Smoke test manual (pós-deploy)

Use após cada release ou mudança de infra.

**Automático (produção):** na raiz do monorepo, com URLs reais:

```bash
npm run smoke:prod -- https://<sua-api> https://<seu-next>
```

- [ ] `GET https://<api>/health` → `200`, `"ok": true`, `"db": "up"`.
- [ ] `GET /api/health` no Next → `200`, `"ok": true`, `"db": "up"` (proxy para a API).
- [ ] Login com usuário de teste (tenant correto).
- [ ] Listar e abrir um contato (`/contacts`).
- [ ] Pipeline: mover um deal entre colunas ou criar deal de teste.
- [ ] `/analytics` carrega sem erro.
- [ ] `/settings` carrega (sem salvar segredos reais em ambiente compartilhado).
- [ ] (Se WhatsApp ativo) enviar mensagem de teste e ver no `/inbox`.

Registrar data, versão (commit) e ambiente (staging/produção).
