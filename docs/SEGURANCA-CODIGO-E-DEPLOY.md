# Quem pode mexer ou ver o código

Documento interno: limites do que usuários finais e terceiros podem fazer em relação ao código-fonte e aos deploys.

## Repositório e deploy (Vercel / Railway / Git)

- **Alterar o que está em produção** (novo build, variáveis, banco ligado ao deploy): só quem tem **acesso ao projeto** (GitHub/GitLab, Vercel, Railway, Neon, etc.) ou credenciais comprometidas.
- **Ver o código-fonte** do monorepo: só quem tem **acesso ao repositório** (ou, se o repo for **público**, qualquer pessoa com o link).

Usuários/clientes que só usam o app **não** entram no Git nem nos painéis da Vercel/Railway por causa do uso normal do CRM.

## O que qualquer site web expõe

- **Front-end** (Next.js): o navegador baixa HTML, JS e assets. Quem quiser pode inspecionar rede, ver bundles (minificados), chamar rotas públicas. Isso **não** é acesso ao código-fonte no Git; é o comportamento normal da web.
- **API**: rotas públicas (login, webhooks) são atingíveis pela internet; o restante depende de **autenticação** (JWT, chaves internas). Sem token ou chave válidos, não há como “editar” o servidor como mantenedor; no máximo existem tentativas de requisição como qualquer cliente HTTP.

## Resumo

| Pergunta | Resposta |
|----------|----------|
| Usuário final altera o código no Git ou no painel de deploy? | **Não**, sem credenciais de acesso. |
| Alguém vê o repositório inteiro? | **Só** quem tem permissão no Git (ou repo público). |
| Algo fica “visível”? | O que o browser já recebe (front, respostas de API que a UI consome) — esperado em qualquer aplicação web. |

## Boas práticas

- Manter o repositório **privado** quando possível.
- Ativar **2FA** nos provedores (GitHub, Vercel, Railway, Neon).
- Revisar periodicamente **membros e permissões** de cada serviço.
- **Não** commitar `.env` com segredos; usar variáveis de ambiente nos painéis.
- Garantir que rotas sensíveis exijam auth no Nest e na web.
