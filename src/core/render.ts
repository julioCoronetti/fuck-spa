import fs from "fs"
import { MAX_CONTENT, RENDER_TIMEOUT, type ExtractionResult } from "./types.js"

export async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright")
    return fs.existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

export async function renderWithPlaywright(url: string): Promise<ExtractionResult> {
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
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT })
      await page.waitForTimeout(1500)
      const text = await page.evaluate(() => document.body.innerText || "")
      const clean = text.replace(/\n{3,}/g, "\n\n").trim()
      if (clean.length < 100) {
        return {
          status: "RENDER_ERROR",
          spaDetected: true,
          source: "render",
          url,
          content: "RENDER_EMPTY: page rendered but no text extracted",
        }
      }
      return { status: "OK", spaDetected: true, source: "render", url, content: clean.slice(0, MAX_CONTENT) }
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
