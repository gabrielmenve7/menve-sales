# Smoke test manual (pós-deploy)

Use após cada release ou mudança de infra.

- [ ] `GET /api/health` → `200`, `"ok": true`, `"db": "up"`.
- [ ] Login com usuário de teste (tenant correto).
- [ ] Listar e abrir um contato (`/contacts`).
- [ ] Pipeline: mover um deal entre colunas ou criar deal de teste.
- [ ] `/analytics` carrega sem erro.
- [ ] `/settings` carrega (sem salvar segredos reais em ambiente compartilhado).
- [ ] (Se WhatsApp ativo) enviar mensagem de teste e ver no `/inbox`.

Registrar data, versão (commit) e ambiente (staging/produção).
