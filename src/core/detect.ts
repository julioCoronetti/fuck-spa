export function isSpaShell(html: string, text: string): boolean {
  if (text.trim().length > 800) return false
  if (html.includes('id="root"') && text.trim().length < 200) return true
  if (html.includes('id="app"') && text.trim().length < 200) return true
  if (html.includes("__NEXT_DATA__") && text.trim().length < 400) return true
  if (html.length > 1000 && text.trim().length < 300) return true
  return false
}

export function isBlocked(html: string, text: string, status: number): boolean {
  if (status === 429) return true
  const lower = `${html} ${text}`.toLowerCase()
  return /access denied|unusual traffic|verify you are human|captcha|not a robot|rate limit|blocked/.test(lower)
}
