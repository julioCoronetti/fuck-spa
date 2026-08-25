// src/opencode/tool.ts
import { tool } from "@opencode-ai/plugin";

// src/core/types.ts
var FETCH_TIMEOUT = 15e3;
var RENDER_TIMEOUT = 2e4;
var CACHE_TTL = 60 * 60 * 1e3;
var CACHE_VERSION = "v2";
var MAX_CONTENT = 15e3;
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// src/core/http.ts
function cleanText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
async function fetchSimple(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_UA }
    });
    if (resp.status === 401 || resp.status === 403) return `LOGIN_REQUIRED: HTTP ${resp.status}`;
    if (!resp.ok) return `FETCH_ERROR: HTTP ${resp.status}`;
    const html = await resp.text();
    return { html, text: cleanText(html), status: resp.status };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "FETCH_ERROR: timeout";
    return `FETCH_ERROR: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}

// src/core/detect.ts
function isSpaShell(html, text) {
  if (text.trim().length > 800) return false;
  if (html.includes('id="root"') && text.trim().length < 200) return true;
  if (html.includes('id="app"') && text.trim().length < 200) return true;
  if (html.includes("__NEXT_DATA__") && text.trim().length < 400) return true;
  if (html.length > 1e3 && text.trim().length < 300) return true;
  return false;
}
function isBlocked(html, text, status) {
  if (status === 429) return true;
  const lower = `${html} ${text}`.toLowerCase();
  return /access denied|unusual traffic|verify you are human|captcha|not a robot|rate limit|blocked/.test(lower);
}

// src/core/render.ts
import fs from "fs";

// src/core/sanitize.ts
var CHUNK_SIZE = 8e3;
var CHUNK_OVERLAP = 200;
function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
function stripTags(inner) {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function htmlToReadableText(html) {
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<(header|nav|footer|aside|form)[\s\S]*?<\/\1>/gi, " ").replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
    const clean = stripTags(inner);
    return clean ? `
${"#".repeat(Number(level))} ${clean}
` : "";
  }).replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    const clean = stripTags(inner);
    return clean ? `
- ${clean}` : "";
  }).replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => {
    const clean = stripTags(inner);
    return clean ? `
${clean}
` : "";
  }).replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return decodeEntities(out);
}
function chunkText(text, maxChars = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const cut = text.lastIndexOf("\n", end);
      if (cut > start + maxChars * 0.5) end = cut;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}
function sanitizeContent(text) {
  const limited = text.slice(0, MAX_CONTENT);
  const chunks = chunkText(limited);
  if (chunks.length > 1) {
    return {
      content: `${chunks[0]}

[conte\xFAdo longo dividido em ${chunks.length} partes \u2014 retornada a 1\xAA parte]`,
      chunks
    };
  }
  return { content: chunks[0] ?? "" };
}

// src/core/render.ts
var BLOCK_PATTERNS = /you'?ve been blocked|access denied|unusual traffic|verify you are human|captcha|not a robot|rate limit/i;
var STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
  "--no-sandbox"
];
var STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, "webdriver", { get: () => undefined });
Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(screen, "availWidth", { get: () => 1920 });
Object.defineProperty(screen, "availHeight", { get: () => 1040 });
Object.defineProperty(screen, "colorDepth", { get: () => 32 });
Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 80 });
if (!window.chrome) {
  window.chrome = {
    runtime: {
      OnInstalledReason: { CHROME_UPDATE: "chrome_update", INSTALL: "install", UPDATE: "update" },
      OnRestartRequiredReason: { APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic" },
      PlatformOs: { LINUX: "linux", MAC: "mac", WIN: "win" },
    },
    loadTimes: () => ({}),
    csi: () => ({}),
  };
}
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function (p) {
  if (p === 37445) return "Intel Inc.";
  if (p === 37446) return "Intel Iris OpenGL Engine";
  return getParameter.call(this, p);
};
`;
function isRenderBlocked(text) {
  return BLOCK_PATTERNS.test(text);
}
function resolveStorageState(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  return JSON.parse(fs.readFileSync(input, "utf-8"));
}
function parseCookiesJson(input) {
  const parsed = JSON.parse(input);
  if (!Array.isArray(parsed)) throw new Error("cookiesJson deve ser um array de cookies");
  return parsed;
}
async function chromiumAvailable() {
  try {
    const { chromium } = await import("playwright");
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}
async function launchChromium(chromium) {
  try {
    return await chromium.launch({ headless: false, args: ["--headless=new", ...STEALTH_ARGS] });
  } catch {
    return await chromium.launch({ headless: true, args: STEALTH_ARGS });
  }
}
async function newContext(browser, session) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/New_York",
    userAgent: BROWSER_UA,
    storageState: session?.storageState ? resolveStorageState(session.storageState) : void 0
  });
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  if (process.env.FUCK_SPA_BLOCK_ASSETS !== "0") {
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      return route.continue();
    });
  }
  if (session?.cookiesJson) {
    await context.addCookies(parseCookiesJson(session.cookiesJson));
  }
  return context;
}
var POLL_INTERVAL = 250;
var POLL_STABLE_SAMPLES = 4;
var POLL_DWELL_MS = 1e3;
var POLL_MIN_TEXT = 100;
async function waitForStableText(page, budgetMs) {
  const start = Date.now();
  const dwellUntil = start + POLL_DWELL_MS;
  let last = "";
  let stable = 0;
  let text = "";
  while (Date.now() - start < budgetMs) {
    await page.waitForTimeout(POLL_INTERVAL);
    text = (await page.evaluate(() => document.body?.innerText || "") || "").trim();
    const same = text === last;
    const eligible = text.length >= POLL_MIN_TEXT && Date.now() >= dwellUntil;
    if (same && eligible) {
      stable++;
      if (stable >= POLL_STABLE_SAMPLES) return text;
    } else if (!same) {
      last = text;
      stable = 0;
    }
  }
  return text;
}
async function renderWithPlaywright(url, session) {
  try {
    const { chromium } = await import("playwright");
    if (!await chromiumAvailable()) {
      return {
        status: "CHROMIUM_MISSING",
        spaDetected: true,
        source: "render",
        url,
        content: "CHROMIUM_MISSING: chromium n\xE3o instalado, rode npm install (postinstall baixa o chromium)"
      };
    }
    const browser = await launchChromium(chromium);
    try {
      let context;
      try {
        context = await newContext(browser, session);
      } catch (e) {
        await browser.close();
        const msg = e instanceof Error ? e.message : String(e);
        return {
          status: "RENDER_ERROR",
          spaDetected: true,
          source: "render",
          url,
          content: `RENDER_ERROR: sess\xE3o inv\xE1lida (${msg.slice(0, 200)})`
        };
      }
      const page = await context.newPage();
      const started = Date.now();
      const usePolling = process.env.FUCK_SPA_RENDER !== "networkidle";
      let text;
      if (usePolling) {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: Math.max(1e3, RENDER_TIMEOUT - (Date.now() - started))
        });
        text = await waitForStableText(page, Math.max(1e3, RENDER_TIMEOUT - (Date.now() - started)));
      } else {
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: Math.max(1e3, RENDER_TIMEOUT - (Date.now() - started))
        });
        await page.waitForTimeout(1500);
        text = (await page.evaluate(() => document.body?.innerText || "") || "").trim();
      }
      const clean = text.replace(/\n{3,}/g, "\n\n").trim();
      if (isRenderBlocked(clean)) {
        return {
          status: "BLOCKED",
          spaDetected: true,
          source: "render",
          url,
          content: "BLOCKED: site bloqueou o render (block page). Tente com sess\xE3o autenticada."
        };
      }
      if (clean.length < 100) {
        return {
          status: "RENDER_ERROR",
          spaDetected: true,
          source: "render",
          url,
          content: "RENDER_EMPTY: page rendered but no text extracted"
        };
      }
      const sanitized = sanitizeContent(clean);
      return {
        status: "OK",
        spaDetected: true,
        source: "render",
        url,
        content: sanitized.content,
        chunks: sanitized.chunks
      };
    } finally {
      await browser.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/error while loading shared libraries|libnspr4|libnss3/.test(msg)) {
      return {
        status: "CHROMIUM_MISSING",
        spaDetected: true,
        source: "render",
        url,
        content: "CHROMIUM_MISSING: chromium n\xE3o roda por falta de libs de sistema (libnspr4/libnss3). Rode 'npx playwright install-deps chromium'"
      };
    }
    if (msg.includes("Cannot find package") || msg.includes("playwright")) {
      return {
        status: "CHROMIUM_MISSING",
        spaDetected: true,
        source: "render",
        url,
        content: "CHROMIUM_MISSING: run install.sh to install chromium"
      };
    }
    return { status: "RENDER_ERROR", spaDetected: true, source: "render", url, content: `RENDER_ERROR: ${msg.slice(0, 300)}` };
  }
}

// src/core/reddit.ts
function redditUrl(url) {
  const m = url.match(/^https?:\/\/(?:www\.)?reddit\.com(\/.*)?$/);
  if (!m) return null;
  return `https://old.reddit.com${m[1] ?? ""}`;
}
async function fetchRedditJson(url) {
  const m = url.match(/^https?:\/\/(?:www\.|old\.)?reddit\.com(\/[^?#]*)/);
  if (!m) return "REDDIT_JSON_ERROR: url inv\xE1lida";
  const pathOnly = m[1].replace(/\/+$/, "");
  if (!pathOnly) return "REDDIT_JSON_ERROR: sem caminho";
  try {
    const resp = await fetch(`https://www.reddit.com${pathOnly}.json`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT)
    });
    if (resp.status === 429) return "REDDIT_JSON_ERROR: HTTP 429 (rate limit)";
    if (!resp.ok) return `REDDIT_JSON_ERROR: HTTP ${resp.status}`;
    const data = await resp.json();
    const post = data[0]?.data?.children?.[0]?.data;
    const comments = data[1]?.data?.children ?? [];
    const parts = [];
    if (post) {
      parts.push(`# ${post.title}`, `u/${post.author} \xB7 r/${post.subreddit}`);
      if (typeof post.selftext === "string" && post.selftext) parts.push(post.selftext);
    }
    for (const child of comments) {
      const body = child?.data?.body;
      if (typeof body === "string") parts.push(body);
    }
    if (parts.length === 0) return "REDDIT_JSON_ERROR: sem conte\xFAdo no JSON";
    return parts.join("\n\n");
  } catch (e) {
    return `REDDIT_JSON_ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}
async function redditContent(url, session) {
  const oldUrl = redditUrl(url);
  const old = await fetchSimple(oldUrl);
  if (typeof old === "object") {
    if (!isBlocked(old.html, old.text, old.status) && !isSpaShell(old.html, old.text) && old.text.length > 200) {
      const sanitized = sanitizeContent(htmlToReadableText(old.html));
      return {
        status: "OK",
        spaDetected: false,
        source: "reddit_old",
        url,
        content: sanitized.content,
        chunks: sanitized.chunks
      };
    }
  }
  const json = await fetchRedditJson(url);
  if (!json.startsWith("REDDIT_JSON_ERROR")) {
    const sanitized = sanitizeContent(json);
    return {
      status: "OK",
      spaDetected: false,
      source: "reddit_json",
      url,
      content: sanitized.content,
      chunks: sanitized.chunks
    };
  }
  const rendered = await renderWithPlaywright(url, session);
  if (rendered.status === "OK") return rendered;
  return {
    status: "REDDIT_ERROR",
    spaDetected: true,
    source: "render",
    url,
    content: `REDDIT_ERROR: old.reddit e JSON bloqueados (${json})
Fallback: ${rendered.content}`
  };
}

// src/core/cache.ts
import fs2 from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
function cacheDir() {
  return path.join(os.tmpdir(), `fuck-spa-${CACHE_VERSION}`);
}
function cacheFile(url) {
  return path.join(cacheDir(), crypto.createHash("sha256").update(url).digest("hex").slice(0, 16) + ".json");
}
function readCache(url) {
  try {
    const p = cacheFile(url);
    const st = fs2.statSync(p);
    if (Date.now() - st.mtimeMs > CACHE_TTL) return null;
    const data = JSON.parse(fs2.readFileSync(p, "utf-8"));
    if (!data.content || data.content.length < 10) return null;
    return data;
  } catch {
    return null;
  }
}
function writeCache(r) {
  if (r.status !== "OK") return;
  try {
    fs2.mkdirSync(cacheDir(), { recursive: true });
    const entry = {
      url: r.url,
      source: r.source,
      spaDetected: r.spaDetected,
      content: r.content,
      chunks: r.chunks,
      savedAt: Date.now()
    };
    fs2.writeFileSync(cacheFile(r.url), JSON.stringify(entry), "utf-8");
  } catch {
  }
}

// src/core/question.ts
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "o",
  "e",
  "de",
  "do",
  "da",
  "que",
  "em",
  "para",
  "com",
  "como",
  "por",
  "se",
  "na",
  "no",
  "os",
  "as",
  "um",
  "uma",
  "\xE9",
  "qual",
  "quais",
  "sobre",
  "me",
  "fale",
  "conte",
  "resuma",
  "explica",
  "explique",
  "summarize",
  "what",
  "is",
  "the",
  "of",
  "to",
  "in",
  "for",
  "on",
  "with",
  "about",
  "and",
  "or",
  "an",
  "can",
  "how",
  "why",
  "when",
  "where",
  "who",
  "which",
  "this",
  "that",
  "it",
  "you",
  "your",
  "my",
  "do",
  "does",
  "did",
  "are",
  "was",
  "were"
]);
function extractKeywords(prompt) {
  const words = prompt.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOPWORDS.has(w)))];
}
function countOccurrences(text, keyword) {
  let count = 0;
  let idx = text.indexOf(keyword);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(keyword, idx + keyword.length);
  }
  return count;
}
function answerFromChunks(chunks, prompt) {
  const keywords = extractKeywords(prompt);
  if (keywords.length === 0) return null;
  const scored = chunks.map((chunk, i) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const kw of keywords) score += countOccurrences(lower, kw);
    return { chunk, i, score };
  }).filter((x) => x.score > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, 3).map((x) => x.chunk).join("\n\n");
}

// src/core/extract.ts
function applyQuestion(out, prompt) {
  if (!prompt || out.status !== "OK") return out;
  const chunks = out.chunks ?? (out.content ? [out.content] : []);
  const answer = answerFromChunks(chunks, prompt);
  if (!answer) return out;
  return { ...out, answer };
}
var SESSION_HINT = " \u2014 forne\xE7a storageState (arquivo JSON exportado do browser) ou cookiesJson";
async function extract(opts) {
  const url = (opts.url ?? "").trim();
  const session = { storageState: opts.storageState, cookiesJson: opts.cookiesJson };
  const hasSession = !!(opts.storageState || opts.cookiesJson);
  if (!url || !/^https?:\/\//.test(url)) {
    return {
      status: "INVALID_URL",
      spaDetected: false,
      source: "fetch",
      url,
      content: "FUCK_SPA_ERROR: url inv\xE1lida, use https://"
    };
  }
  if (!opts.noCache) {
    const cached = readCache(url);
    if (cached) {
      const base = {
        status: "OK",
        spaDetected: cached.spaDetected,
        source: "cache",
        url,
        content: cached.content,
        chunks: cached.chunks
      };
      return applyQuestion(base, opts.prompt);
    }
  }
  let out;
  if (redditUrl(url)) {
    out = await redditContent(url, session);
  } else {
    const fetched = await fetchSimple(url);
    if (typeof fetched === "string") {
      if (fetched.startsWith("LOGIN_REQUIRED")) {
        const rendered = hasSession ? await renderWithPlaywright(url, session) : null;
        if (rendered && rendered.status === "OK") {
          out = rendered;
        } else {
          out = {
            status: "LOGIN_REQUIRED",
            spaDetected: false,
            source: "fetch",
            url,
            content: rendered ? `${fetched}${SESSION_HINT} \u2014 render com sess\xE3o falhou: ${rendered.content}` : `${fetched}${SESSION_HINT}`
          };
        }
      } else if (fetched.startsWith("FETCH_ERROR")) {
        const rendered = await renderWithPlaywright(url, session);
        if (rendered.status === "OK") {
          out = rendered;
        } else {
          out = {
            status: "FETCH_ERROR",
            spaDetected: false,
            source: "fetch",
            url,
            content: `${fetched}
Fallback: ${rendered.content}`
          };
        }
      } else {
        out = { status: "FETCH_ERROR", spaDetected: false, source: "fetch", url, content: fetched };
      }
    } else if (isBlocked(fetched.html, fetched.text, fetched.status)) {
      const rendered = hasSession ? await renderWithPlaywright(url, session) : null;
      if (rendered && rendered.status === "OK") {
        out = rendered;
      } else {
        out = {
          status: "BLOCKED",
          spaDetected: false,
          source: "fetch",
          url,
          content: rendered ? `BLOCKED: site detectou agente autom\xE1tico${SESSION_HINT} \u2014 render com sess\xE3o falhou: ${rendered.content}` : `BLOCKED: site detectou agente autom\xE1tico (block page)${SESSION_HINT}`
        };
      }
    } else if (!isSpaShell(fetched.html, fetched.text)) {
      const sanitized = sanitizeContent(htmlToReadableText(fetched.html));
      out = {
        status: "OK",
        spaDetected: false,
        source: "fetch",
        url,
        content: sanitized.content,
        chunks: sanitized.chunks
      };
    } else {
      const rendered = await renderWithPlaywright(url, session);
      if (rendered.status === "OK") {
        out = rendered;
      } else {
        out = {
          status: rendered.status,
          spaDetected: true,
          source: "render",
          url,
          content: `SPA detectada mas render falhou: ${rendered.content}
Fetch text parcial: ${fetched.text.slice(0, 2e3)}`
        };
      }
    }
  }
  out = applyQuestion(out, opts.prompt);
  writeCache(out);
  return out;
}

// src/core/format.ts
function formatResult(r, prompt) {
  if (r.status === "OK") {
    if (r.answer) return `Pergunta: ${prompt ?? ""}

Resposta (trecho de ${r.url}):
${r.answer}`;
    if (prompt) return `Conte\xFAdo de ${r.url}:
${r.content}

Pergunta: ${prompt}`;
    return r.content;
  }
  return r.content;
}

// src/opencode/tool.ts
var tool_default = tool({
  description: "Extrai conte\xFAdo leg\xEDvel de qualquer URL, com fallback para SPA. Use quando webfetch retorna shell vazio.",
  args: {
    url: tool.schema.string().describe("URL para extrair"),
    prompt: tool.schema.string().optional().describe("Pergunta espec\xEDfica sobre a p\xE1gina"),
    noCache: tool.schema.boolean().optional().describe("Ignorar cache e for\xE7ar refetch"),
    storageState: tool.schema.string().optional().describe("Sess\xE3o autenticada: caminho de arquivo JSON ou JSON inline exportado do browser"),
    cookiesJson: tool.schema.string().optional().describe("Sess\xE3o autenticada: JSON string com array de cookies")
  },
  async execute(args) {
    const result = await extract({
      url: args.url ?? "",
      prompt: args.prompt,
      noCache: args.noCache,
      storageState: args.storageState,
      cookiesJson: args.cookiesJson
    });
    return formatResult(result, args.prompt);
  }
});
export {
  tool_default as default
};
