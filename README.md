# fuck-spa

Leitor minimalista para SPAs. Transforma qualquer link em contexto legível para agente de IA.

Quando `webfetch` retorna shell vazio, usa renderização headless para extrair texto.

## Instalação

```sh
git clone https://github.com/julioCoronetti/fuck-spa.git
cd fuck-spa
./install.sh
```

O `install.sh` instala o playwright, baixa o chromium, tenta instalar as libs de sistema (pode pedir senha do `sudo`) e valida que o chromium abre.

Se as libs de sistema não forem instaladas (ex.: ambiente sem sudo), rode manualmente:
```sh
sudo npx playwright install-deps chromium
```

## Uso no opencode

```
/fuck-spa https://exemplo.com/spa-page
```

Ou via tool `fuck-spa` com `url` e `prompt` opcional.

## Uso em qualquer harness (MCP)

O `install.sh` copia o servidor MCP para `~/.config/opencode/tools/fuck-spa-mcp.js`. Registre em qualquer harness que suporte MCP stdio:

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

A tool expõe `fetch-spa` com argumentos `url`, `prompt` e `noCache`.

## Como funciona

1. Tenta `fetch` simples
2. Detecta SPA shell vazio (`#root` vazia, `__NEXT_DATA__`, body < 500 chars)
3. Fallback para `playwright` com `networkidle` e extrai `innerText`
4. Retorna markdown limpo para o agente

## Requisitos

- `bun` ou `npm`
- Sem as libs de sistema do chromium, a tool retorna erro claro `CHROMIUM_MISSING` com a instrução
