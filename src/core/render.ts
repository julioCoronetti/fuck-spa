import fs from "fs"
import type { Browser, Page } from "playwright"
import { BROWSER_UA, RENDER_TIMEOUT, type ExtractionResult, type SessionOptions } from "./types.js"
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

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
  "--no-sandbox",
]

const STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, "webdriver", { get: () => undefined });
Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(screen, "availWidth", { get: () => 1920 });
Object.defineProperty(screen, "availHeight", { get: () => 1040 });
Object.defineProperty(screen, "colorDepth", { get: () => 32 });
Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 80 });
if (!window.chrome) {
  window.chrome = {
    runtime: {
      OnInstalledReason: { CHROME_UPDATE: "chrome_update", INSTALL: "install", UPDATE: "update" },
      OnRestartRequiredReason: { APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic" },
      PlatformOs: { LINUX: "linux", MAC: "mac", WIN: "win" },
    },
    loadTimes: () => ({}),
    csi: () => ({}),
  };
}
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function (p) {
  if (p === 37445) return "Intel Inc.";
  if (p === 37446) return "Intel Iris OpenGL Engine";
  return getParameter.call(this, p);
};
`

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

async function launchChromium(chromium: typeof import("playwright").chromium): Promise<Browser> {
  try {
    return await chromium.launch({ headless: false, args: ["--headless=new", ...STEALTH_ARGS] })
  } catch {
    return await chromium.launch({ headless: true, args: STEALTH_ARGS })
  }
}

async function newContext(
  browser: Awaited<ReturnType<typeof launchChromium>>,
  session?: SessionOptions,
) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/New_York",
    userAgent: BROWSER_UA,
    storageState: session?.storageState ? resolveStorageState(session.storageState) : undefined,
  })
  await context.addInitScript(STEALTH_INIT_SCRIPT)
  if (process.env.FUCK_SPA_BLOCK_ASSETS !== "0") {
    await context.route("**/*", (route) => {
      const type = route.request().resourceType()
      if (type === "image" || type === "font" || type === "media") return route.abort()
      return route.continue()
    })
  }
  if (session?.cookiesJson) {
    await context.addCookies(parseCookiesJson(session.cookiesJson))
  }
  return context
}

const POLL_INTERVAL = 250
const POLL_STABLE_SAMPLES = 4
const POLL_DWELL_MS = 1000
const POLL_MIN_TEXT = 100

async function waitForStableText(page: Page, budgetMs: number): Promise<string> {
  const start = Date.now()
  const dwellUntil = start + POLL_DWELL_MS
  let last = ""
  let stable = 0
  let text = ""
  while (Date.now() - start < budgetMs) {
    await page.waitForTimeout(POLL_INTERVAL)
    text = ((await page.evaluate(() => document.body?.innerText || "")) || "").trim()
    const same = text === last
    const eligible = text.length >= POLL_MIN_TEXT && Date.now() >= dwellUntil
    if (same && eligible) {
      stable++
      if (stable >= POLL_STABLE_SAMPLES) return text
    } else if (!same) {
      last = text
      stable = 0
    }
  }
  return text
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
    const browser = await launchChromium(chromium)
    try {
      let context
      try {
        context = await newContext(browser, session)
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
      const started = Date.now()
      const usePolling = process.env.FUCK_SPA_RENDER !== "networkidle"
      let text: string
      if (usePolling) {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: Math.max(1000, RENDER_TIMEOUT - (Date.now() - started)),
        })
        text = await waitForStableText(page, Math.max(1000, RENDER_TIMEOUT - (Date.now() - started)))
      } else {
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: Math.max(1000, RENDER_TIMEOUT - (Date.now() - started)),
        })
        await page.waitForTimeout(1500)
        text = ((await page.evaluate(() => document.body?.innerText || "")) || "").trim()
      }
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
