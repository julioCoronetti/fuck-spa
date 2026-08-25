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

## Como funciona

1. Tenta `fetch` simples
2. Detecta SPA shell vazio (`#root` vazia, `__NEXT_DATA__`, body < 500 chars)
3. Fallback para `playwright` com `networkidle` e extrai `innerText`
4. Retorna markdown limpo para o agente

## Requisitos

- `bun` ou `npm`
- Sem as libs de sistema do chromium, a tool retorna erro claro `CHROMIUM_MISSING` com a instrução
