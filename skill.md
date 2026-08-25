# fuck-spa skill

Use quando `webfetch` falha ou retorna HTML vazio de SPA.

## Uso consciente

A tool fica sempre disponível. Para evitar uso indiscriminado (tokens/desempenho), configure o opencode para aprovar cada execução — `opencode.json`:

```json
{ "permission": { "tools": { "fuck-spa": "ask" } } }
```

Assim o modelo pede sua aprovação antes de cada chamada.

## Quando usar

- Página retorna `<div id="root"></div>` ou `<div id="app"></div>` sem texto
- Body < 500 caracteres e contém `__NEXT_DATA__`, `vite`, `react`
- Usuário quer usar link como fonte de contexto e agente não conseguiu ler

## Fluxo

1. Chamar tool `fuck-spa` com `url`
2. Se sucesso, usar texto retornado como contexto
3. Se `login required` ou `blocked`, avisar usuário que precisa de sessão autenticada

## Sessão autenticada

Páginas que exigem login (ou sites que bloqueiam agentes, ex.: Reddit) podem ser lidas com a sessão do usuário. Passar `storageState` (caminho de arquivo ou JSON inline) ou `cookiesJson`:

```sh
# exportar a sessão do browser (uma vez)
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.newPage().then(p => p.goto('https://site.com'));
  console.log('faça o login na janela e pressione Enter');
  await new Promise(r => process.stdin.once('data', r));
  await context.storageState({ path: 'state.json' });
  await browser.close();
})();
"
```

Depois chamar a tool com `storageState: "state.json"`. Nunca burlar paywall — só usar a sessão fornecida.

## Setup

- `install.sh` baixa playwright + chromium e tenta instalar as libs de sistema
- Se o sudo não estiver disponível, rode manualmente `sudo npx playwright install-deps chromium`
- Sem as libs (ex.: libnspr4/libnss3), a tool retorna erro claro `CHROMIUM_MISSING`

## Limites

- Não tenta burlar login/paywall sem sessão fornecida
- Timeout 15s para fetch, 20s para render
- Retorna erro claro se chromium não instalado
