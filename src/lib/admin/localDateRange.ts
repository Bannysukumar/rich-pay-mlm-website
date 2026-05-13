/** Local calendar day bounds for client-side filtering (browser timezone). */

export function localDayStartMs(ymd: string): number | null {
  if (!ymd.trim()) return null
  const t = new Date(`${ymd}T00:00:00`).getTime()
  return Number.isNaN(t) ? null : t
}

export function localDayEndMs(ymd: string): number | null {
  if (!ymd.trim()) return null
  const t = new Date(`${ymd}T23:59:59.999`).getTime()
  return Number.isNaN(t) ? null : t
}

/** When both dates empty, always returns true for the row. */
export function rowMsInLocalDateRange(ms: number, dateFromYmd: string, dateToYmd: string): boolean {
  const fromMs = localDayStartMs(dateFromYmd)
  const toMs = localDayEndMs(dateToYmd)
  if (fromMs == null && toMs == null) return true
  if (!Number.isFinite(ms) || ms <= 0) return false
  if (fromMs != null && ms < fromMs) return false
  if (toMs != null && ms > toMs) return false
  return true
}
