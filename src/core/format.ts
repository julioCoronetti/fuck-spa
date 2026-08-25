import type { ExtractionResult } from "./types.js"

export function formatResult(r: ExtractionResult, prompt?: string): string {
  if (r.status === "OK") {
    if (r.answer) return `Conteúdo de ${r.url}:\n${r.content}\n\nPergunta: ${prompt ?? ""}\n\nResposta: ${r.answer}`
    if (prompt) return `Conteúdo de ${r.url}:\n${r.content}\n\nPergunta: ${prompt}`
    return r.content
  }
  return r.content
}
