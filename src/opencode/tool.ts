import { tool } from "@opencode-ai/plugin"
import { extract } from "../core/extract.js"
import { formatResult } from "../core/format.js"

export default tool({
  description: "Extrai conteúdo legível de qualquer URL, com fallback para SPA. Use quando webfetch retorna shell vazio.",
  args: {
    url: tool.schema.string().describe("URL para extrair"),
    prompt: tool.schema.string().optional().describe("Pergunta específica sobre a página"),
    noCache: tool.schema.boolean().optional().describe("Ignorar cache e forçar refetch"),
    storageState: tool.schema
      .string()
      .optional()
      .describe("Sessão autenticada: caminho de arquivo JSON ou JSON inline exportado do browser"),
    cookiesJson: tool.schema
      .string()
      .optional()
      .describe("Sessão autenticada: JSON string com array de cookies"),
  },
  async execute(args) {
    const result = await extract({
      url: args.url ?? "",
      prompt: args.prompt,
      noCache: args.noCache,
      storageState: args.storageState,
      cookiesJson: args.cookiesJson,
    })
    return formatResult(result, args.prompt)
  },
})