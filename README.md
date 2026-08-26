# fuck-spa

SPA reader that turns any link into readable context for AI agents. Works with any harness (opencode, Claude Code, Cursor, etc.) through a pure core plus MCP stdio.

When `webfetch` returns an empty shell, it falls back to headless rendering (chromium) to extract text.

## Install

One command, no clone:

```sh
curl -fsSL https://raw.githubusercontent.com/julioCoronetti/fuck-spa/main/install.sh | bash
```

Pin a version with `FUCK_SPA_VERSION` (default `main`, e.g. `v0.3.0`) and install elsewhere with `OPENCODE_CONFIG_DIR` (default `~/.config/opencode`):

```sh
FUCK_SPA_VERSION=v0.3.0 curl -fsSL https://raw.githubusercontent.com/julioCoronetti/fuck-spa/main/install.sh | bash
```

Clone and run locally is also supported:

```sh
git clone https://github.com/julioCoronetti/fuck-spa.git
cd fuck-spa
./install.sh
```

The `install.sh` detects the mode by the presence of `dist/` next to the script: a cloned repo copies locally, a piped download fetches the artifacts from raw.githubusercontent:
- Copies the bundles (`fuck-spa.js` for opencode into `tools/`, `fuck-spa-mcp.js` for any harness into `mcp/`)
- Installs playwright, downloads chromium and tries to install system libraries (may ask for `sudo`)
- Validates that chromium launches

The tool is always available. To prevent indiscriminate use (tokens/performance), make opencode ask for approval on every call — `opencode.json`:

```json
{ "permission": { "tools": { "fuck-spa": "ask" } } }
```

If system libraries were not installed (e.g. no sudo available), run:
```sh
sudo npx playwright install-deps chromium
```

Without the libraries, the tool returns a clear `CHROMIUM_MISSING` error with instructions.

## Usage

**opencode** — the `fuck-spa` tool is available automatically after `install.sh`.

**Any harness (MCP)** — register the MCP server (`fuck-spa-mcp.js`) in any MCP-stdio-capable harness. The tool is exposed as `fetch-spa`.

| Argument | Description |
|---|---|
| `url` | URL to extract (required) |
| `prompt` | Specific question about the page — returns only the relevant excerpt (keyword matching) |
| `noCache` | Skip the 1h cache and refetch |

**Claude Code**
```sh
claude mcp add fuck-spa -- node ~/.config/opencode/mcp/fuck-spa-mcp.js
```

**Cursor** — `.cursor/mcp.json`
```json
{ "mcpServers": { "fuck-spa": { "command": "node", "args": ["~/.config/opencode/mcp/fuck-spa-mcp.js"] } } }
```

**opencode via MCP** — `opencode.json`
```json
{ "mcp": { "fuck-spa": { "type": "local", "command": ["node", "~/.config/opencode/mcp/fuck-spa-mcp.js"] } } }
```

## How it works

1. Simple `fetch` with a browser User-Agent
2. SPA shell detection (`#root` empty, `__NEXT_DATA__`, body < 500 chars) and block detection (block pages, rate limits)
3. Reddit-specific handling (old.reddit, `.json` endpoint, render fallback)
4. Headless render fallback with chromium (anti-detection hardening: new headless mode + stealth patches)
5. Sanitization to lightweight markdown (removes nav/header/footer/scripts, converts headings and lists)
6. Text over 8k chars is split into overlapping chunks, returning the first part plus a notice
7. With `prompt`, chunks are filtered by keywords and only the relevant excerpt is returned (falls back to full text)

## Architecture

```
src/
  core/     → harness-independent logic (http, detect, render, reddit, cache, sanitize, question, extract)
  mcp/      → MCP stdio server
  opencode/ → thin opencode adapter
dist/       → single-file bundles (fuck-spa.opencode.js, fuck-spa-mcp.js)
test/       → node:test suite
```

## Development

```sh
# tests (compile with tsc, run with node --test)
npm install --no-save --ignore-scripts --silent typescript @types/node
npx tsc src/core/*.ts test/*.ts --outDir .build-test --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --esModuleInterop --types node
node --test .build-test/test/
rm -rf .build-test

# rebuild bundles after src/ changes
npx esbuild src/opencode/tool.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa.opencode.js --external:@opencode-ai/plugin --external:playwright
npx esbuild src/mcp/server.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa-mcp.js --external:playwright

# release: rebuilds, guards against stale dist, bumps version, tags and pushes
./release.sh [patch|minor|major]
```

## Requirements

- `bun` or `npm`
- Node 18+ (for the MCP server)
- Chromium (installed by `install.sh`; system libraries may require sudo)