import fs from "fs"
import path from "path"
import os from "os"
import crypto from "crypto"
import { CACHE_TTL, CACHE_VERSION, type CacheEntry, type ExtractionResult } from "./types.js"

function cacheDir(): string {
  return path.join(os.tmpdir(), `fuck-spa-${CACHE_VERSION}`)
}

function cacheFile(url: string): string {
  return path.join(cacheDir(), crypto.createHash("sha256").update(url).digest("hex").slice(0, 16) + ".json")
}

export function readCache(url: string): CacheEntry | null {
  try {
    const p = cacheFile(url)
    const st = fs.statSync(p)
    if (Date.now() - st.mtimeMs > CACHE_TTL) return null
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as CacheEntry
    if (!data.content || data.content.length < 10) return null
    return data
  } catch {
    return null
  }
}

export function writeCache(r: ExtractionResult): void {
  if (r.status !== "OK") return
  try {
    fs.mkdirSync(cacheDir(), { recursive: true })
    const entry: CacheEntry = {
      url: r.url,
      source: r.source,
      spaDetected: r.spaDetected,
      content: r.content,
      chunks: r.chunks,
      savedAt: Date.now(),
    }
    fs.writeFileSync(cacheFile(r.url), JSON.stringify(entry), "utf-8")
  } catch {}
}
