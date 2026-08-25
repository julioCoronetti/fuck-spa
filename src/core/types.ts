export const FETCH_TIMEOUT = 15000
export const RENDER_TIMEOUT = 20000
export const CACHE_TTL = 60 * 60 * 1000
export const CACHE_VERSION = "v2"
export const MAX_CONTENT = 15000
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

export type ExtractionStatus =
  | "OK"
  | "BLOCKED"
  | "LOGIN_REQUIRED"
  | "FETCH_ERROR"
  | "RENDER_ERROR"
  | "CHROMIUM_MISSING"
  | "REDDIT_ERROR"
  | "INVALID_URL"

export type ExtractionSource = "cache" | "fetch" | "render" | "reddit_old" | "reddit_json"

export type SessionOptions = {
  storageState?: string
  cookiesJson?: string
}

export type ExtractOptions = {
  url: string
  prompt?: string
  noCache?: boolean
} & SessionOptions

export type ExtractionResult = {
  status: ExtractionStatus
  spaDetected: boolean
  source: ExtractionSource
  url: string
  content: string
  chunks?: string[]
  answer?: string
}

export type CacheEntry = {
  url: string
  source: ExtractionSource
  spaDetected: boolean
  content: string
  chunks?: string[]
  savedAt: number
}
