# fuck-spa

SPA reader that turns any link into readable context for AI agents. Works with any harness (opencode, Claude Code, Cursor, etc.) through a pure core plus MCP stdio.

When `webfetch` returns an empty shell, it falls back to headless rendering (chromium) to extract text.

## Install

```sh
git clone https://github.com/julioCoronetti/fuck-spa.git
cd fuck-spa
./install.sh
```

The `install.sh`:
- Installs playwright, downloads chromium and tries to install system libraries (may ask for `sudo`)
- Validates that chromium launches

The tool is installed **disabled by default** — it does not occupy model context/tokens until you need it:

```sh
./fuck-spa.sh on      # enable (restart opencode to load)
./fuck-spa.sh off     # disable after use
./fuck-spa.sh status  # check state
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
npx --yes -p typescript -p @types/node tsc src/core/*.ts test/*.ts --outDir .build-test --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --esModuleInterop
node --test .build-test/test/
rm -rf .build-test

# rebuild bundles after src/ changes
npx esbuild src/opencode/tool.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa.opencode.js --external:@opencode-ai/plugin --external:playwright
npx esbuild src/mcp/server.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa-mcp.js --external:playwright
```

## Requirements

- `bun` or `npm`
- Node 18+ (for the MCP server)
- Chromium (installed by `install.sh`; system libraries may require sudo)