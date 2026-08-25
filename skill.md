# fuck-spa skill

Use quando `webfetch` falha ou retorna HTML vazio de SPA.

## Quando usar

- Página retorna `<div id="root"></div>` ou `<div id="app"></div>` sem texto
- Body < 500 caracteres e contém `__NEXT_DATA__`, `vite`, `react`
- Usuário quer usar link como fonte de contexto e agente não conseguiu ler

## Fluxo

1. Chamar tool `fuck-spa` com `url`
2. Se sucesso, usar texto retornado como contexto
3. Se `login required`, avisar usuário que precisa de sessão autenticada

## Setup

- `install.sh` baixa playwright + chromium e tenta instalar as libs de sistema
- Se o sudo não estiver disponível, rode manualmente `sudo npx playwright install-deps chromium`
- Sem as libs (ex.: libnspr4/libnss3), a tool retorna erro claro `CHROMIUM_MISSING`

## Limites

- Não tenta burlar login/paywall sem sessão fornecida
- Timeout 15s para fetch, 20s para render
- Retorna erro claro se chromium não instalado
