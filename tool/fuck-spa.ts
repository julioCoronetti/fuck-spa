import { tool } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"
import crypto from "crypto"

const FETCH_TIMEOUT = 15000
const RENDER_TIMEOUT = 20000
const CACHE_TTL = 60 * 60 * 1000
const CACHE_DIR = path.join(os.tmpdir(), "fuck-spa")

function cacheKey(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)
}

function readCache(url: string): string | null {
  try {
    const p = path.join(CACHE_DIR, cacheKey(url) + ".txt")
    const st = fs.statSync(p)
    if (Date.now() - st.mtimeMs > CACHE_TTL) return null
    const data = fs.readFileSync(p, "utf-8")
    if (data.length < 10) return null
    return data
  } catch {
    return null
  }
}

function writeCache(url: string, content: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const p = path.join(CACHE_DIR, cacheKey(url) + ".txt")
    fs.writeFileSync(p, content, "utf-8")
  } catch {}
}

function isSpaShell(html: string, text: string): boolean {
  if (text.trim().length > 800) return false
  if (html.includes('id="root"') && text.trim().length < 200) return true
  if (html.includes('id="app"') && text.trim().length < 200) return true
  if (html.includes("__NEXT_DATA__") && text.trim().length < 400) return true
  if (html.length > 1000 && text.trim().length < 300) return true
  return false
}

function cleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchSimple(url: string): Promise<{ html: string; text: string; status: number } | string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "fuck-spa/0.1" },
    })
    if (resp.status === 401 || resp.status === 403) return `LOGIN_REQUIRED: HTTP ${resp.status}`
    if (!resp.ok) return `FETCH_ERROR: HTTP ${resp.status}`
    const html = await resp.text()
    const text = cleanText(html)
    return { html, text, status: resp.status }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return "FETCH_ERROR: timeout"
    return `FETCH_ERROR: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    clearTimeout(timer)
  }
}

async function renderWithPlaywright(url: string): Promise<string> {
  try {
    const { chromium } = await import("playwright")
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT })
      await page.waitForTimeout(1500)
      const text = await page.evaluate(() => document.body.innerText || "")
      const clean = text.replace(/\n{3,}/g, "\n\n").trim()
      if (clean.length < 100) return "RENDER_EMPTY: page rendered but no text extracted"
      return clean.slice(0, 15000)
    } finally {
      await browser.close()
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("Cannot find package") || msg.includes("playwright")) {
      return "PLAYWRIGHT_MISSING: run install.sh to install chromium"
    }
    return `RENDER_ERROR: ${msg.slice(0, 300)}`
  }
}

export default tool({
  description: "Extrai conteúdo legível de qualquer URL, com fallback para SPA. Use quando webfetch retorna shell vazio.",
  args: {
    url: tool.schema.string().describe("URL para extrair"),
    prompt: tool.schema.string().optional().describe("Pergunta específica sobre a página"),
    noCache: tool.schema.boolean().optional().describe("Ignorar cache e forçar refetch"),
  },
  async execute(args) {
    const url = args.url?.trim()
    if (!url || !/^https?:\/\//.test(url)) return "FUCK_SPA_ERROR: url inválida, use https://"
    if (!args.noCache) {
      const cached = readCache(url)
      if (cached) {
        if (args.prompt) return `${cached}\n\nPergunta: ${args.prompt} (cache)`
        return cached
      }
    }
    let result: string
    const fetched = await fetchSimple(url)
    if (typeof fetched === "string") {
      if (fetched.startsWith("LOGIN_REQUIRED")) result = `${fetched} — página requer login, forneça sessão autenticada`
      else if (fetched.startsWith("FETCH_ERROR")) {
        const rendered = await renderWithPlaywright(url)
        if (rendered.startsWith("RENDER_") || rendered.startsWith("PLAYWRIGHT")) result = `${fetched}\nFallback: ${rendered}`
        else result = rendered
      } else result = fetched
    } else if (!isSpaShell(fetched.html, fetched.text)) {
      const out = fetched.text.slice(0, 15000)
      result = args.prompt ? `Conteúdo de ${url}:\n${out}\n\nPergunta: ${args.prompt}` : out
    } else {
      const rendered = await renderWithPlaywright(url)
      if (rendered.startsWith("RENDER_") || rendered.startsWith("PLAYWRIGHT") || rendered.startsWith("LOGIN")) {
        result = `SPA detectada mas render falhou: ${rendered}\nFetch text parcial: ${fetched.text.slice(0, 2000)}`
      } else {
        result = args.prompt ? `Conteúdo renderizado de ${url}:\n${rendered}\n\nPergunta: ${args.prompt}` : rendered
      }
    }
    if (result.length > 100 && !result.startsWith("FUCK_SPA_ERROR") && !result.startsWith("FETCH_ERROR") && !result.startsWith("RENDER_") && !result.startsWith("PLAYWRIGHT") && !result.includes("LOGIN_REQUIRED")) {
      writeCache(url, result)
    }
    return result
  },
})
