import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanText } from "../src/core/http.js"
import { isBlocked, isSpaShell } from "../src/core/detect.js"
import { redditUrl } from "../src/core/reddit.js"
import { extract } from "../src/core/extract.js"
import { formatResult } from "../src/core/format.js"

const SPA_SHELL =
  '<html><head><title>App</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
const BLOCK_PAGE =
  '<html><head><title>Access Denied</title></head><body>Request blocked by security policy</body></html>'
const NORMAL = "<html><body><h1>Titulo</h1><p>Conteudo normal da pagina aqui.</p><script>var x=1</script></body></html>"

async function withFetch(
  handler: (url: string) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch
  globalThis.fetch = handler as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

test("cleanText remove script/style e normaliza espacos", () => {
  const out = cleanText('<html><script>var a=1</script><style>body{}</style><p>  Hello   world </p></html>')
  assert.equal(out, "Hello world")
})

test("isSpaShell detecta shells", () => {
  assert.equal(isSpaShell(SPA_SHELL, cleanText(SPA_SHELL)), true)
  assert.equal(isSpaShell(NORMAL, cleanText(NORMAL)), false)
  assert.equal(isSpaShell("<html><body>__NEXT_DATA__</body></html>", "x".repeat(100)), true)
})

test("isBlocked detecta block pages e 429", () => {
  assert.equal(isBlocked(BLOCK_PAGE, cleanText(BLOCK_PAGE), 200), true)
  assert.equal(isBlocked("", "", 429), true)
  assert.equal(isBlocked(NORMAL, cleanText(NORMAL), 200), false)
})

test("redditUrl converte para old.reddit", () => {
  assert.equal(redditUrl("https://www.reddit.com/r/test/"), "https://old.reddit.com/r/test/")
  assert.equal(redditUrl("https://reddit.com/r/test"), "https://old.reddit.com/r/test")
  assert.equal(redditUrl("https://old.reddit.com/r/test/"), null)
  assert.equal(redditUrl("https://example.com/"), null)
})

test("extract: url invalida", async () => {
  const r = await extract({ url: "abc" })
  assert.equal(r.status, "INVALID_URL")
  assert.match(r.content, /^FUCK_SPA_ERROR:/)
})

test("extract: pagina normal via fetch direto", async () => {
  await withFetch(async () => new Response(NORMAL, { status: 200, headers: { "content-type": "text/html" } }), async () => {
    const r = await extract({ url: "https://exemplo.com/pagina", noCache: true })
    assert.equal(r.status, "OK")
    assert.equal(r.source, "fetch")
    assert.equal(r.spaDetected, false)
    assert.match(r.content, /Conteudo normal/)
  })
})

test("extract: block page retorna BLOCKED", async () => {
  await withFetch(async () => new Response(BLOCK_PAGE, { status: 200 }), async () => {
    const r = await extract({ url: "https://exemplo.com/bloqueada", noCache: true })
    assert.equal(r.status, "BLOCKED")
    assert.match(r.content, /^BLOCKED:/)
  })
})

test("extract: login required", async () => {
  await withFetch(async () => new Response("unauthorized", { status: 401 }), async () => {
    const r = await extract({ url: "https://exemplo.com/privada", noCache: true })
    assert.equal(r.status, "LOGIN_REQUIRED")
    assert.match(r.content, /^LOGIN_REQUIRED:/)
  })
})

test("extract: cache grava so content (sem prompt embutido)", async () => {
  const url = "https://exemplo.com/cache-unic"
  await withFetch(async () => new Response(NORMAL, { status: 200 }), async () => {
    const r1 = await extract({ url, prompt: "qual o conteudo?", noCache: true })
    assert.equal(r1.source, "fetch")
    const r2 = await extract({ url })
    assert.equal(r2.source, "cache")
    assert.equal(r2.content, r1.content)
    assert.ok(!r2.content.includes("qual o conteudo?"))
  })
})

test("formatResult: erro mantem prefixo", () => {
  const r = { status: "BLOCKED" as const, spaDetected: false, source: "fetch" as const, url: "u", content: "BLOCKED: x" }
  assert.equal(formatResult(r), "BLOCKED: x")
})

test("formatResult: OK com prompt", () => {
  const r = {
    status: "OK" as const,
    spaDetected: false,
    source: "fetch" as const,
    url: "https://a",
    content: "texto",
  }
  assert.equal(formatResult(r, "pergunta"), "Conteúdo de https://a:\ntexto\n\nPergunta: pergunta")
})
