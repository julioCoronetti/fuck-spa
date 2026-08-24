# fuck-spa

Leitor minimalista para SPAs. Transforma qualquer link em contexto legível para agente de IA.

Quando `webfetch` retorna shell vazio, usa renderização headless para extrair texto.

## Instalação

```sh
git clone https://github.com/julioCoronetti/fuck-spa.git
cd fuck-spa
./install.sh
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
- `playwright` instala `chromium` automaticamente no `install.sh`
