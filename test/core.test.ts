import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanText } from "../src/core/http.js"
import { isBlocked, isSpaShell } from "../src/core/detect.js"
import { redditUrl } from "../src/core/reddit.js"
import { extract } from "../src/core/extract.js"
import { formatResult } from "../src/core/format.js"
import { chunkText, htmlToReadableText, sanitizeContent } from "../src/core/sanitize.js"
import { answerFromChunks, extractKeywords } from "../src/core/question.js"
import { parseCookiesJson, resolveStorageState } from "../src/core/render.js"

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

test("render: block page renderizada nao vira conteudo", async () => {
  const { isRenderBlocked } = await import("../src/core/render.js")
  assert.equal(isRenderBlocked("You've been blocked by network security. If you think..."), true)
  assert.equal(isRenderBlocked("Please verify you are human by completing the captcha"), true)
  assert.equal(isRenderBlocked("Access Denied: request blocked by policy"), true)
  assert.equal(isRenderBlocked("Conteudo normal sobre programacao e tecnologia"), false)
  assert.equal(isRenderBlocked("artigo discutindo ad-blockers e politicas"), false)
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

test("htmlToReadableText: markdown leve e remocao de nav", () => {
  const html =
    "<html><nav>Menu topo</nav><h1>Titulo</h1><p>Paragrafo um.</p><ul><li>Item A</li><li>Item B</li></ul><footer>Rodape</footer></html>"
  const out = htmlToReadableText(html)
  assert.match(out, /^# Titulo/)
  assert.match(out, /Paragrafo um/)
  assert.match(out, /- Item A/)
  assert.match(out, /- Item B/)
  assert.ok(!out.includes("Menu topo"))
  assert.ok(!out.includes("Rodape"))
})

test("htmlToReadableText: decodifica entidades", () => {
  assert.equal(htmlToReadableText("<p>A &amp; B &lt; C</p>"), "A & B < C")
})

test("chunkText: divide com overlap e nao perde conteudo", () => {
  const text = "a".repeat(5000) + "\n" + "b".repeat(5000)
  const chunks = chunkText(text, 4000, 200)
  assert.ok(chunks.length >= 2)
  for (const c of chunks) assert.ok(c.length <= 4000)
  const joined = chunks.join("")
  assert.ok(joined.includes("a".repeat(100)))
  assert.ok(joined.includes("b".repeat(100)))
})

test("sanitizeContent: texto curto nao chunkia", () => {
  const out = sanitizeContent("texto curto")
  assert.equal(out.content, "texto curto")
  assert.equal(out.chunks, undefined)
})

test("sanitizeContent: texto longo chunkia com aviso", () => {
  const long = "linha um\n".repeat(3000)
  const out = sanitizeContent(long)
  assert.ok(out.chunks && out.chunks.length > 1)
  assert.match(out.content, /conteúdo longo dividido em \d+ partes/)
  assert.ok(out.content.length < long.length)
})

test("extractKeywords: remove stopwords", () => {
  const kws = extractKeywords("o que é o preço do café no Brasil?")
  assert.ok(kws.includes("preço"))
  assert.ok(kws.includes("café"))
  assert.ok(kws.includes("brasil"))
  assert.ok(!kws.includes("que"))
  assert.ok(!kws.includes("o"))
})

test("answerFromChunks: retorna chunks relevantes", () => {
  const chunks = ["sobre plantio de café em minas gerais", "receita de bolo de chocolate", "exportação de café no brasil"]
  const answer = answerFromChunks(chunks, "onde tem café no brasil?")
  assert.ok(answer)
  assert.match(answer ?? "", /café/)
})

test("answerFromChunks: fallback null sem match", () => {
  const answer = answerFromChunks(["futebol e futebol"], "qual a capital da frança?")
  assert.equal(answer, null)
})

test("extract: modo pergunta responde trecho via cache", async () => {
  const url = "https://exemplo.com/pergunta-unic"
  const html = "<html><body><h1>Guia de Node</h1><p>Node usa V8 e npm para pacotes.</p></body></html>"
  await withFetch(async () => new Response(html, { status: 200 }), async () => {
    const r = await extract({ url, prompt: "qual engine o node usa?", noCache: true })
    assert.equal(r.status, "OK")
    assert.ok(r.answer && r.answer.includes("V8"))
    const r2 = await extract({ url, prompt: "qual engine o node usa?" })
    assert.equal(r2.source, "cache")
    assert.ok(r2.answer && r2.answer.includes("V8"))
  })
})

test("resolveStorageState: aceita JSON inline e caminho de arquivo", () => {
  const inline = resolveStorageState('{"cookies":[{"name":"a","value":"b","domain":"x.com","path":"/"}]}')
  assert.deepEqual(inline, { cookies: [{ name: "a", value: "b", domain: "x.com", path: "/" }] })
  assert.throws(() => resolveStorageState("/tmp/nao-existe-state.json"))
})

test("parseCookiesJson: valida array de cookies", () => {
  const cookies = parseCookiesJson('[{"name":"session","value":"abc","domain":"x.com","path":"/"}]')
  assert.equal(cookies.length, 1)
  assert.equal(cookies[0].name, "session")
  assert.throws(() => parseCookiesJson('{"nao":"array"}'))
})

test("extract: login required sem sessao orienta como fornecer", async () => {
  await withFetch(async () => new Response("unauthorized", { status: 401 }), async () => {
    const r = await extract({ url: "https://exemplo.com/privada2", noCache: true })
    assert.equal(r.status, "LOGIN_REQUIRED")
    assert.match(r.content, /storageState|sessão/)
  })
})
