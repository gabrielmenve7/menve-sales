# Menve Sales — extensão WhatsApp Web

Extensão Manifest V3 (Chrome / Edge) que abre um **painel lateral** com dados do contato e deals no Menve ao navegar no WhatsApp Web.

## Instalação (desenvolvimento)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative **Modo do desenvolvedor**.
3. **Carregar sem compactação** e selecione esta pasta `menve-sales-extension`.

## Uso

1. Clique com o botão direito no ícone da extensão → **Opções** (ou use o botão no painel).
2. Preencha:
   - **URL da API:** base pública da API Nest, sem barra no final (ex.: `https://sua-api.up.railway.app`).
   - **JWT:** token Bearer válido (mesmo usado pela API autenticada).
   - **URL do CRM (opcional):** para o botão “Abrir no CRM” (`…/contacts/:id`).
3. Abra [WhatsApp Web](https://web.whatsapp.com) e uma conversa **1:1**.
4. Clique no ícone da extensão para abrir o **painel lateral** (Side Panel).

## Permissões

- `storage` — guardar configuração e último telefone detectado.
- `sidePanel` — painel lateral nativo.
- `host_permissions` — `web.whatsapp.com` para o content script; `<all_urls>` para permitir qualquer URL da API na configuração. Para builds internos, restrinja ao domínio da API.

## API necessária

Requer o endpoint `GET /contacts/resolve?phone=` na API Menve (tenant inferido do JWT). Veja [`docs/WHATSAPP-WEB-EXTENSION.md`](../docs/WHATSAPP-WEB-EXTENSION.md).
