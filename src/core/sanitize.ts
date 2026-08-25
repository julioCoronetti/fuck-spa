import { MAX_CONTENT } from "./types.js"

export const CHUNK_SIZE = 8000
export const CHUNK_OVERLAP = 200

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function stripTags(inner: string): string {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function htmlToReadableText(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(header|nav|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
      const clean = stripTags(inner)
      return clean ? `\n${"#".repeat(Number(level))} ${clean}\n` : ""
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => {
      const clean = stripTags(inner)
      return clean ? `\n- ${clean}` : ""
    })
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner: string) => {
      const clean = stripTags(inner)
      return clean ? `\n${clean}\n` : ""
    })
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  return decodeEntities(out)
}

export function chunkText(text: string, maxChars = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length)
    if (end < text.length) {
      const cut = text.lastIndexOf("\n", end)
      if (cut > start + maxChars * 0.5) end = cut
    }
    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= text.length) break
    start = end - overlap
  }
  return chunks
}

export function sanitizeContent(text: string): { content: string; chunks?: string[] } {
  const limited = text.slice(0, MAX_CONTENT)
  const chunks = chunkText(limited)
  if (chunks.length > 1) {
    return {
      content: `${chunks[0]}\n\n[conteúdo longo dividido em ${chunks.length} partes — retornada a 1ª parte]`,
      chunks,
    }
  }
  return { content: chunks[0] ?? "" }
}