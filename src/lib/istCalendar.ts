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

/** Default: no ROI / team level on Sunday (IST). */
export const DEFAULT_ROI_OFF_WEEKDAYS: number[] = [0]

export const ROI_WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function istWeekdayIndex(when = new Date()): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: ROI_CALENDAR_TZ, weekday: 'short' }).format(when)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

export function normalizeRoiOffWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ROI_OFF_WEEKDAYS]
  const out = [
    ...new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ].sort((a, b) => a - b)
  return out.length > 0 ? out : [...DEFAULT_ROI_OFF_WEEKDAYS]
}

export function isSundayIst(when = new Date()): boolean {
  return istWeekdayIndex(when) === 0
}

export function isRoiOffWeekday(offWeekdays: number[], when = new Date()): boolean {
  return normalizeRoiOffWeekdays(offWeekdays).includes(istWeekdayIndex(when))
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

export function shouldSkipDailyRoiAndTeamLevel(
  offDates: string[],
  offWeekdays: number[] = DEFAULT_ROI_OFF_WEEKDAYS,
  when = new Date(),
): boolean {
  if (isRoiOffWeekday(offWeekdays, when)) return true
  return isRoiOffDate(offDates, when)
}

/** Whole IST calendar days from `startDayKey` through `endDayKey` (same day → 0). */
export function wholeIstCalendarDaysBetween(startDayKey: string, endDayKey: string): number {
  const [sy, sm, sd] = startDayKey.split('-').map(Number)
  const [ey, em, ed] = endDayKey.split('-').map(Number)
  const startMs = Date.UTC(sy, sm - 1, sd)
  const endMs = Date.UTC(ey, em - 1, ed)
  return Math.max(0, Math.floor((endMs - startMs) / 86400000))
}

/** IST calendar days elapsed since package start through `asOfMs` (matches ROI midnight IST). */
export function wholeIstDaysSinceStart(startedAtMs: number, asOfMs: number): number {
  return wholeIstCalendarDaysBetween(istDayKey(new Date(startedAtMs)), istDayKey(new Date(asOfMs)))
}

/** Remaining team-level payout window days for a downline stake as of `asOfMs`. */
export function remainingTeamLevelWindowDays(
  startedAtMs: number,
  maxPayDays: number | null | undefined,
  asOfMs: number,
): number | null {
  if (maxPayDays === undefined) return null
  if (maxPayDays === null) return null
  const elapsed = wholeIstDaysSinceStart(startedAtMs, asOfMs)
  return Math.max(0, maxPayDays - elapsed)
}
