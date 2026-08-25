# fuck-spa

Leitor para SPAs que transforma qualquer link em contexto legível para agente de IA. Funciona em qualquer harness (opencode, Claude Code, Cursor, etc.) via core puro + MCP stdio.

Quando `webfetch` retorna shell vazio, usa renderização headless (chromium) para extrair texto.

## Instalação

```sh
git clone https://github.com/julioCoronetti/fuck-spa.git
cd fuck-spa
./install.sh
```

O `install.sh`:
- Copia os bundles para `~/.config/opencode/tools/` (`fuck-spa.js` para o opencode, `fuck-spa-mcp.js` para qualquer harness)
- Instala o playwright, baixa o chromium e tenta instalar as libs de sistema (pode pedir senha do `sudo`)
- Valida que o chromium abre

Se as libs de sistema não forem instaladas (ex.: ambiente sem sudo), rode manualmente:
```sh
sudo npx playwright install-deps chromium
```

Sem as libs, a tool retorna erro claro `CHROMIUM_MISSING` com a instrução.

## Uso no opencode

A tool `fuck-spa` fica disponível automaticamente após o `install.sh`. Argumentos:

| Argumento | Descrição |
|---|---|
| `url` | URL para extrair (obrigatório) |
| `prompt` | Pergunta específica sobre a página — retorna só o trecho relevante (keyword matching) |
| `noCache` | Ignorar o cache de 1h e refazer o fetch |
| `storageState` | Sessão autenticada: caminho de arquivo JSON ou JSON inline exportado do browser |
| `cookiesJson` | Sessão autenticada: JSON string com array de cookies |

## Sessão autenticada (login e bloqueios)

Páginas que exigem login, e sites que bloqueiam agentes (ex.: Reddit), podem ser lidos com a sessão do usuário — nunca há bypass automático. Para exportar a sessão do seu browser:

```sh
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

Depois chame a tool com `storageState: "state.json"`. Nos casos `LOGIN_REQUIRED` ou `BLOCKED`, a tool orienta como fornecer a sessão.

## Uso em qualquer harness (MCP)

Registre o servidor MCP (`fuck-spa-mcp.js`) em qualquer harness que suporte MCP stdio. A tool expõe `fetch-spa` com os mesmos argumentos `url`, `prompt` e `noCache`.

**Claude Code**
```sh
claude mcp add fuck-spa -- node ~/.config/opencode/tools/fuck-spa-mcp.js
```

**Cursor** — `.cursor/mcp.json`
```json
{ "mcpServers": { "fuck-spa": { "command": "node", "args": ["~/.config/opencode/tools/fuck-spa-mcp.js"] } } }
```

**opencode via MCP** — `opencode.json`
```json
{ "mcp": { "fuck-spa": { "type": "local", "command": ["node", "~/.config/opencode/tools/fuck-spa-mcp.js"] } } }
```

## Como funciona

1. `fetch` simples com User-Agent de browser
2. Detecção de SPA shell (`#root` vazia, `__NEXT_DATA__`, body < 500 chars) e de bloqueio (block pages, rate limit)
3. Tratamento específico do Reddit (old.reddit, endpoint `.json`, fallback para render)
4. Fallback para renderização com chromium (`networkidle` + `innerText`)
5. Sanitização para markdown leve (remove nav/header/footer/scripts, converte títulos/listas)
6. Se o texto excede 8k chars, divide em chunks com overlap e retorna a 1ª parte + aviso
7. Com `prompt`, filtra os chunks por keywords e retorna o trecho relevante (fallback para o texto completo)

## Estrutura

```
src/
  core/     → lógica pura independente de harness (http, detect, render, reddit, cache, sanitize, question, extract)
  mcp/      → servidor MCP stdio
  opencode/ → camada fina do opencode
dist/       → bundles single-file (fuck-spa.opencode.js, fuck-spa-mcp.js)
test/       → testes com node:test
```

## Desenvolvimento

```sh
# testes (compila com tsc e roda node --test)
npx --yes -p typescript -p @types/node tsc src/core/*.ts test/*.ts --outDir .build-test --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --esModuleInterop
node --test .build-test/test/
rm -rf .build-test

# regenerar bundles após mudanças em src/
npx esbuild src/opencode/tool.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa.opencode.js --external:@opencode-ai/plugin --external:playwright
npx esbuild src/mcp/server.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa-mcp.js --external:playwright
```

## Requisitos

- `bun` ou `npm`
- Node 18+ (para o servidor MCP)
- Chromium (instalado pelo `install.sh`; libs de sistema podem exigir sudo)