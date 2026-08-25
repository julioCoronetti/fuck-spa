import { BROWSER_UA, FETCH_TIMEOUT, type ExtractionResult } from "./types.js"
import { fetchSimple } from "./http.js"
import { isBlocked, isSpaShell } from "./detect.js"
import { renderWithPlaywright } from "./render.js"
import { htmlToReadableText, sanitizeContent } from "./sanitize.js"

export function redditUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?reddit\.com(\/.*)?$/)
  if (!m) return null
  return `https://old.reddit.com${m[1] ?? ""}`
}

export async function fetchRedditJson(url: string): Promise<string> {
  const m = url.match(/^https?:\/\/(?:www\.|old\.)?reddit\.com(\/[^?#]*)/)
  if (!m) return "REDDIT_JSON_ERROR: url inválida"
  const pathOnly = m[1].replace(/\/+$/, "")
  if (!pathOnly) return "REDDIT_JSON_ERROR: sem caminho"
  try {
    const resp = await fetch(`https://www.reddit.com${pathOnly}.json`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (resp.status === 429) return "REDDIT_JSON_ERROR: HTTP 429 (rate limit)"
    if (!resp.ok) return `REDDIT_JSON_ERROR: HTTP ${resp.status}`
    const data = (await resp.json()) as Array<{ data: { children: Array<{ data: Record<string, unknown> }> } }>
    const post = data[0]?.data?.children?.[0]?.data
    const comments = data[1]?.data?.children ?? []
    const parts: string[] = []
    if (post) {
      parts.push(`# ${post.title}`, `u/${post.author} · r/${post.subreddit}`)
      if (typeof post.selftext === "string" && post.selftext) parts.push(post.selftext)
    }
    for (const child of comments) {
      const body = (child?.data as Record<string, unknown> | undefined)?.body
      if (typeof body === "string") parts.push(body)
    }
    if (parts.length === 0) return "REDDIT_JSON_ERROR: sem conteúdo no JSON"
    return parts.join("\n\n")
  } catch (e: unknown) {
    return `REDDIT_JSON_ERROR: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function redditContent(url: string): Promise<ExtractionResult> {
  const oldUrl = redditUrl(url) as string
  const old = await fetchSimple(oldUrl)
  if (typeof old === "object") {
    if (!isBlocked(old.html, old.text, old.status) && !isSpaShell(old.html, old.text) && old.text.length > 200) {
      const sanitized = sanitizeContent(htmlToReadableText(old.html))
      return {
        status: "OK",
        spaDetected: false,
        source: "reddit_old",
        url,
        content: sanitized.content,
        chunks: sanitized.chunks,
      }
    }
  }
  const json = await fetchRedditJson(url)
  if (!json.startsWith("REDDIT_JSON_ERROR")) {
    const sanitized = sanitizeContent(json)
    return {
      status: "OK",
      spaDetected: false,
      source: "reddit_json",
      url,
      content: sanitized.content,
      chunks: sanitized.chunks,
    }
  }
  const rendered = await renderWithPlaywright(url)
  if (rendered.status === "OK") return rendered
  return {
    status: "REDDIT_ERROR",
    spaDetected: true,
    source: "render",
    url,
    content: `REDDIT_ERROR: old.reddit e JSON bloqueados (${json})\nFallback: ${rendered.content}`,
  }
}
