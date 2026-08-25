import { type ExtractOptions, type ExtractionResult } from "./types.js"
import { fetchSimple } from "./http.js"
import { isBlocked, isSpaShell } from "./detect.js"
import { renderWithPlaywright } from "./render.js"
import { redditContent, redditUrl } from "./reddit.js"
import { readCache, writeCache } from "./cache.js"
import { htmlToReadableText, sanitizeContent } from "./sanitize.js"
import { answerFromChunks } from "./question.js"

function applyQuestion(out: ExtractionResult, prompt?: string): ExtractionResult {
  if (!prompt || out.status !== "OK") return out
  const chunks = out.chunks ?? (out.content ? [out.content] : [])
  const answer = answerFromChunks(chunks, prompt)
  if (!answer) return out
  return { ...out, answer }
}

const SESSION_HINT = " — forneça storageState (arquivo JSON exportado do browser) ou cookiesJson"

export async function extract(opts: ExtractOptions): Promise<ExtractionResult> {
  const url = (opts.url ?? "").trim()
  const session = { storageState: opts.storageState, cookiesJson: opts.cookiesJson }
  const hasSession = !!(opts.storageState || opts.cookiesJson)
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
      const base = {
        status: "OK" as const,
        spaDetected: cached.spaDetected,
        source: "cache" as const,
        url,
        content: cached.content,
        chunks: cached.chunks,
      }
      return applyQuestion(base, opts.prompt)
    }
  }
  let out: ExtractionResult
  if (redditUrl(url)) {
    out = await redditContent(url, session)
  } else {
    const fetched = await fetchSimple(url)
    if (typeof fetched === "string") {
      if (fetched.startsWith("LOGIN_REQUIRED")) {
        const rendered = hasSession ? await renderWithPlaywright(url, session) : null
        if (rendered && rendered.status === "OK") {
          out = rendered
        } else {
          out = {
            status: "LOGIN_REQUIRED",
            spaDetected: false,
            source: "fetch",
            url,
            content: rendered
              ? `${fetched}${SESSION_HINT} — render com sessão falhou: ${rendered.content}`
              : `${fetched}${SESSION_HINT}`,
          }
        }
      } else if (fetched.startsWith("FETCH_ERROR")) {
        const rendered = await renderWithPlaywright(url, session)
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
      const rendered = hasSession ? await renderWithPlaywright(url, session) : null
      if (rendered && rendered.status === "OK") {
        out = rendered
      } else {
        out = {
          status: "BLOCKED",
          spaDetected: false,
          source: "fetch",
          url,
          content: rendered
            ? `BLOCKED: site detectou agente automático${SESSION_HINT} — render com sessão falhou: ${rendered.content}`
            : `BLOCKED: site detectou agente automático (block page)${SESSION_HINT}`,
        }
      }
    } else if (!isSpaShell(fetched.html, fetched.text)) {
      const sanitized = sanitizeContent(htmlToReadableText(fetched.html))
      out = {
        status: "OK",
        spaDetected: false,
        source: "fetch",
        url,
        content: sanitized.content,
        chunks: sanitized.chunks,
      }
    } else {
      const rendered = await renderWithPlaywright(url, session)
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
  out = applyQuestion(out, opts.prompt)
  writeCache(out)
  return out
}
