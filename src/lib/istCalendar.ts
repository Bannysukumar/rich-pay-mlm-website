/** Daily ROI cron uses midnight in this timezone. */
export const ROI_CALENDAR_TZ = 'Asia/Kolkata'

/** Calendar day key `YYYY-MM-DD` in IST. */
export function istDayKey(when = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ROI_CALENDAR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when)
}

export function istWeekdayLong(when = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: ROI_CALENDAR_TZ, weekday: 'long' }).format(when)
}

export function isSundayIst(when = new Date()): boolean {
  return istWeekdayLong(when) === 'Sunday'
}

export function normalizeRoiOffDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const d of raw) {
    const s = String(d).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out.add(s)
  }
  return [...out].sort()
}

export function isRoiOffDate(offDates: string[], when = new Date()): boolean {
  return offDates.includes(istDayKey(when))
}

export function shouldSkipDailyRoiAndTeamLevel(offDates: string[], when = new Date()): boolean {
  return isSundayIst(when) || isRoiOffDate(offDates, when)
}
