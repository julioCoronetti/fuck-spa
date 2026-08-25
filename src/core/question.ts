const STOPWORDS = new Set([
  "a", "o", "e", "de", "do", "da", "que", "em", "para", "com", "como", "por", "se", "na", "no",
  "os", "as", "um", "uma", "é", "qual", "quais", "sobre", "me", "fale", "conte", "resuma",
  "explica", "explique", "summarize", "what", "is", "the", "of", "to", "in", "for", "on",
  "with", "about", "and", "or", "an", "can", "how", "why", "when", "where", "who", "which",
  "this", "that", "it", "you", "your", "my", "do", "does", "did", "are", "was", "were",
])

export function extractKeywords(prompt: string): string[] {
  const words = prompt.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) ?? []
  return [...new Set(words.filter((w) => !STOPWORDS.has(w)))]
}

function countOccurrences(text: string, keyword: string): number {
  let count = 0
  let idx = text.indexOf(keyword)
  while (idx !== -1) {
    count++
    idx = text.indexOf(keyword, idx + keyword.length)
  }
  return count
}

export function answerFromChunks(chunks: string[], prompt: string): string | null {
  const keywords = extractKeywords(prompt)
  if (keywords.length === 0) return null
  const scored = chunks
    .map((chunk, i) => {
      const lower = chunk.toLowerCase()
      let score = 0
      for (const kw of keywords) score += countOccurrences(lower, kw)
      return { chunk, i, score }
    })
    .filter((x) => x.score > 0)
  if (scored.length === 0) return null
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, 3).map((x) => x.chunk).join("\n\n")
}