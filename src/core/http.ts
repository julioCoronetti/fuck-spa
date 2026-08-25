import { BROWSER_UA, FETCH_TIMEOUT } from "./types.js"

export type FetchResult = { html: string; text: string; status: number }

export function cleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function fetchSimple(url: string): Promise<FetchResult | string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_UA },
    })
    if (resp.status === 401 || resp.status === 403) return `LOGIN_REQUIRED: HTTP ${resp.status}`
    if (!resp.ok) return `FETCH_ERROR: HTTP ${resp.status}`
    const html = await resp.text()
    return { html, text: cleanText(html), status: resp.status }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return "FETCH_ERROR: timeout"
    return `FETCH_ERROR: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    clearTimeout(timer)
  }
}
