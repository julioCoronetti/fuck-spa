import fs from "fs"
import { RENDER_TIMEOUT, type ExtractionResult, type SessionOptions } from "./types.js"
import { sanitizeContent } from "./sanitize.js"

export type StorageStateInput = {
  cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: "Lax" | "None" | "Strict"
  }>
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>
}

const BLOCK_PATTERNS = /you'?ve been blocked|access denied|unusual traffic|verify you are human|captcha|not a robot|rate limit/i

export function isRenderBlocked(text: string): boolean {
  return BLOCK_PATTERNS.test(text)
}

export function resolveStorageState(input: string): StorageStateInput {
  const trimmed = input.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed) as StorageStateInput
  return JSON.parse(fs.readFileSync(input, "utf-8")) as StorageStateInput
}

export function parseCookiesJson(
  input: string,
): Array<{ name: string; value: string; domain?: string; path?: string }> {
  const parsed = JSON.parse(input) as Array<{ name: string; value: string; domain?: string; path?: string }>
  if (!Array.isArray(parsed)) throw new Error("cookiesJson deve ser um array de cookies")
  return parsed
}

export async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright")
    return fs.existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

export async function renderWithPlaywright(
  url: string,
  session?: SessionOptions,
): Promise<ExtractionResult> {
  try {
    const { chromium } = await import("playwright")
    if (!(await chromiumAvailable())) {
      return {
        status: "CHROMIUM_MISSING",
        spaDetected: true,
        source: "render",
        url,
        content: "CHROMIUM_MISSING: chromium não instalado, rode npm install (postinstall baixa o chromium)",
      }
    }
    const browser = await chromium.launch({ headless: true })
    try {
      let context
      try {
        context = session?.storageState
          ? await browser.newContext({ storageState: resolveStorageState(session.storageState) })
          : await browser.newContext()
        if (session?.cookiesJson) {
          await context.addCookies(parseCookiesJson(session.cookiesJson))
        }
      } catch (e: unknown) {
        await browser.close()
        const msg = e instanceof Error ? e.message : String(e)
        return {
          status: "RENDER_ERROR",
          spaDetected: true,
          source: "render",
          url,
          content: `RENDER_ERROR: sessão inválida (${msg.slice(0, 200)})`,
        }
      }
      const page = await context.newPage()
      await page.goto(url, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT })
      await page.waitForTimeout(1500)
      const text = await page.evaluate(() => document.body.innerText || "")
      const clean = text.replace(/\n{3,}/g, "\n\n").trim()
      if (isRenderBlocked(clean)) {
        return {
          status: "BLOCKED",
          spaDetected: true,
          source: "render",
          url,
          content: "BLOCKED: site bloqueou o render (block page). Tente com sessão autenticada.",
        }
      }
      if (clean.length < 100) {
        return {
          status: "RENDER_ERROR",
          spaDetected: true,
          source: "render",
          url,
          content: "RENDER_EMPTY: page rendered but no text extracted",
        }
      }
      const sanitized = sanitizeContent(clean)
      return {
        status: "OK",
        spaDetected: true,
        source: "render",
        url,
        content: sanitized.content,
        chunks: sanitized.chunks,
      }
    } finally {
      await browser.close()
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/error while loading shared libraries|libnspr4|libnss3/.test(msg)) {
      return {
        status: "CHROMIUM_MISSING",
        spaDetected: true,
        source: "render",
        url,
        content:
          "CHROMIUM_MISSING: chromium não roda por falta de libs de sistema (libnspr4/libnss3). Rode 'npx playwright install-deps chromium'",
      }
    }
    if (msg.includes("Cannot find package") || msg.includes("playwright")) {
      return {
        status: "CHROMIUM_MISSING",
        spaDetected: true,
        source: "render",
        url,
        content: "CHROMIUM_MISSING: run install.sh to install chromium",
      }
    }
    return { status: "RENDER_ERROR", spaDetected: true, source: "render", url, content: `RENDER_ERROR: ${msg.slice(0, 300)}` }
  }
}
