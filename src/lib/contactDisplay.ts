/** Display label for Telegram URL or @username / handle (public `/contact`). */
export function formatTelegramLabel(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      const host = u.hostname.replace(/^www\./, '')
      if (host === 't.me' || host === 'telegram.me' || host === 'telegram.dog') {
        const slug = u.pathname.replace(/^\//, '').split('/')[0] ?? ''
        return slug ? `@${slug}` : t
      }
      return t
    } catch {
      return t
    }
  }
  if (t.startsWith('@')) return t
  return `@${t.replace(/^@/, '')}`
}

/** Link href for Telegram (full URL unchanged, handles → https://t.me/handle). */
export function telegramChannelHref(raw: string): string {
  const t = raw.trim()
  if (!t) return '#'
  if (/^https?:\/\//i.test(t)) return t
  const user = t.replace(/^@/, '').split(/[/?#]/)[0]
  return user ? `https://t.me/${encodeURIComponent(user)}` : '#'
}
