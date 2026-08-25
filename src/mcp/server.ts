import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { extract } from "../core/extract.js"
import { formatResult } from "../core/format.js"

const server = new McpServer({
  name: "fuck-spa",
  version: "0.1.0",
})

server.registerTool(
  "fetch-spa",
  {
    description:
      "Extrai conteúdo legível de qualquer URL, com fallback para SPA. Use quando webfetch retorna shell vazio.",
    inputSchema: {
      url: z.string().describe("URL para extrair"),
      prompt: z.string().optional().describe("Pergunta específica sobre a página"),
      noCache: z.boolean().optional().describe("Ignorar cache e forçar refetch"),
    },
    outputSchema: {
      status: z.string(),
      spaDetected: z.boolean(),
      source: z.string(),
      content: z.string(),
    },
  },
  async (args) => {
    try {
      const result = await extract({ url: args.url, prompt: args.prompt, noCache: args.noCache })
      return {
        content: [{ type: "text", text: formatResult(result, args.prompt) }],
        structuredContent: {
          status: result.status,
          spaDetected: result.spaDetected,
          source: result.source,
          content: result.content,
        },
      }
    } catch (e: unknown) {
      return {
        content: [{ type: "text", text: `FUCK_SPA_ERROR: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)