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

/** Default: no ROI / team level on Saturday + Sunday (IST). */
export const DEFAULT_ROI_OFF_WEEKDAYS: number[] = [0, 6]

/** Nightly ROI cron time label (matches `processDailyRoi` schedule). */
export const ROI_JOB_TIME_LABEL_IST = '12:00 AM IST'

/**
 * Estimate the IST calendar day when remaining daily ROI (2×) will finish.
 * Counts Mon–Fri paying days (or whatever `offWeekdays` allows), $dailyPay each.
 * Returns `YYYY-MM-DD` or null if already complete / invalid.
 */
export function estimateRoi2xCompleteIstDay(
  roiRemaining: number,
  dailyPay: number,
  offWeekdays: number[] = DEFAULT_ROI_OFF_WEEKDAYS,
  offDates: string[] = [],
  fromWhen = new Date(),
): string | null {
  const left0 = Math.max(0, Number(roiRemaining) || 0)
  const pay = Math.max(0, Number(dailyPay) || 0)
  if (left0 <= 1e-9) return null
  if (pay <= 1e-9) return null
  const offWd = new Set(normalizeRoiOffWeekdays(offWeekdays))
  const offDay = new Set(normalizeRoiOffDates(offDates))
  let need = left0
  // Start from tomorrow IST calendar day (tonight's job already credited "today" or will).
  let cursor = new Date(fromWhen.getTime() + 86400000)
  for (let guard = 0; guard < 4000; guard++) {
    const key = istDayKey(cursor)
    const wd = istWeekdayIndex(cursor)
    if (!offWd.has(wd) && !offDay.has(key)) {
      need -= pay
      if (need <= 1e-9) return key
    }
    cursor = new Date(cursor.getTime() + 86400000)
  }
  return null
}

/** Format `YYYY-MM-DD` IST day for member UI, e.g. `26 Apr 2027, 12:00 AM IST`. */
export function formatRoi2xCompleteLabel(istDayKeyStr: string | null): string {
  if (!istDayKeyStr) return '—'
  const [y, m, d] = istDayKeyStr.split('-').map(Number)
  if (!y || !m || !d) return istDayKeyStr
  const label = new Date(Date.UTC(y, m - 1, d, 6, 0, 0)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${label}, ${ROI_JOB_TIME_LABEL_IST}`
}

/** Short label for which weekdays are off, e.g. "Sat+Sun off". */
export function formatRoiOffWeekdaysShort(offWeekdays: number[] = DEFAULT_ROI_OFF_WEEKDAYS): string {
  const set = new Set(normalizeRoiOffWeekdays(offWeekdays))
  const labels: string[] = []
  if (set.has(6)) labels.push('Sat')
  if (set.has(0)) labels.push('Sun')
  for (const o of ROI_WEEKDAY_OPTIONS) {
    if ((o.value === 0 || o.value === 6) && set.has(o.value)) continue
    if (set.has(o.value)) labels.push(o.label.slice(0, 3))
  }
  if (labels.length === 0) return 'no weekly off days'
  if (labels.length === 1) return `${labels[0]} off`
  if (labels.length === 2) return `${labels[0]}+${labels[1]} off`
  return `${labels.join('+')} off`
}

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

/**
 * Paying days elapsed since package start (skips ROI-off weekdays).
 * Default off weekdays: Sunday(0) + Saturday(6), matching site `roiOffWeekdays`.
 */
export function payingIstDaysSinceStart(
  startedAtMs: number,
  asOfMs: number,
  offWeekdays: number[] = [0, 6],
): number {
  const startKey = istDayKey(new Date(startedAtMs))
  const endKey = istDayKey(new Date(asOfMs))
  const [sy, sm, sd] = startKey.split('-').map(Number)
  const [ey, em, ed] = endKey.split('-').map(Number)
  let cursor = Date.UTC(sy, sm - 1, sd)
  const endMs = Date.UTC(ey, em - 1, ed)
  if (endMs <= cursor) return 0
  const off = new Set(offWeekdays)
  let paid = 0
  for (let guard = 0; guard < 8000 && cursor < endMs; guard++) {
    const when = new Date(cursor + 12 * 3600000)
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(when)
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const idx = map[wd] ?? 0
    if (!off.has(idx)) paid++
    cursor += 86400000
  }
  return paid
}

/** Remaining team-level payout window days for a downline stake as of `asOfMs` (paying days only). */
export function remainingTeamLevelWindowDays(
  startedAtMs: number,
  maxPayDays: number | null | undefined,
  asOfMs: number,
): number | null {
  if (maxPayDays === undefined) return null
  if (maxPayDays === null) return null
  const elapsed = payingIstDaysSinceStart(startedAtMs, asOfMs)
  return Math.max(0, maxPayDays - elapsed)
}
