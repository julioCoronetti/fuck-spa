import { MAX_CONTENT, type ExtractOptions, type ExtractionResult } from "./types.js"
import { fetchSimple } from "./http.js"
import { isBlocked, isSpaShell } from "./detect.js"
import { renderWithPlaywright } from "./render.js"
import { redditContent, redditUrl } from "./reddit.js"
import { readCache, writeCache } from "./cache.js"

export async function extract(opts: ExtractOptions): Promise<ExtractionResult> {
  const url = (opts.url ?? "").trim()
  if (!url || !/^https?:\/\//.test(url)) {
    return {
      status: "INVALID_URL",
      spaDetected: false,
      source: "fetch",
      url,
      content: "FUCK_SPA_ERROR: url inválida, use https://",
    }
  }
  if (!opts.noCache) {
    const cached = readCache(url)
    if (cached) {
      return { status: "OK", spaDetected: cached.spaDetected, source: "cache", url, content: cached.content }
    }
  }
  let out: ExtractionResult
  if (redditUrl(url)) {
    out = await redditContent(url)
  } else {
    const fetched = await fetchSimple(url)
    if (typeof fetched === "string") {
      if (fetched.startsWith("LOGIN_REQUIRED")) {
        out = {
          status: "LOGIN_REQUIRED",
          spaDetected: false,
          source: "fetch",
          url,
          content: `${fetched} — página requer login, forneça sessão autenticada`,
        }
      } else if (fetched.startsWith("FETCH_ERROR")) {
        const rendered = await renderWithPlaywright(url)
        if (rendered.status === "OK") {
          out = rendered
        } else {
          out = {
            status: "FETCH_ERROR",
            spaDetected: false,
            source: "fetch",
            url,
            content: `${fetched}\nFallback: ${rendered.content}`,
          }
        }
      } else {
        out = { status: "FETCH_ERROR", spaDetected: false, source: "fetch", url, content: fetched }
      }
    } else if (isBlocked(fetched.html, fetched.text, fetched.status)) {
      out = {
        status: "BLOCKED",
        spaDetected: false,
        source: "fetch",
        url,
        content:
          "BLOCKED: site detectou agente automático (block page). Tente via chromium ou forneça sessão autenticada.",
      }
    } else if (!isSpaShell(fetched.html, fetched.text)) {
      out = { status: "OK", spaDetected: false, source: "fetch", url, content: fetched.text.slice(0, MAX_CONTENT) }
    } else {
      const rendered = await renderWithPlaywright(url)
      if (rendered.status === "OK") {
        out = rendered
      } else {
        out = {
          status: rendered.status,
          spaDetected: true,
          source: "render",
          url,
          content: `SPA detectada mas render falhou: ${rendered.content}\nFetch text parcial: ${fetched.text.slice(0, 2000)}`,
        }
      }
    }
  }
  writeCache(out)
  return out
}
