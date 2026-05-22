import type { SiteSettings, WithdrawPackageCapRow } from '@/types/models'

export type WithdrawPolicy = Record<string, unknown>

/** Mon–Sat (Sunday excluded). */
export const DEFAULT_WITHDRAWAL_ALLOWED_WEEKDAYS: number[] = [1, 2, 3, 4, 5, 6]

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function livePolicyFromSiteSettings(s: SiteSettings): WithdrawPolicy {
  return {
    withdrawPoliciesVersion: s.withdrawPoliciesVersion ?? 0,
    withdrawalsEnabled: s.withdrawalsEnabled !== false,
    withdrawalRequiresActivePackage: s.withdrawalRequiresActivePackage !== false,
    withdrawNetworkLabel: s.withdrawNetworkLabel ?? s.depositNetwork,
    minWithdrawal: s.minWithdrawal,
    withdrawFeePercent: s.withdrawFeePercent,
    withdrawalWindowStart: s.withdrawalWindowStart ?? '10:30',
    withdrawalWindowEnd: s.withdrawalWindowEnd ?? '13:30',
    withdrawalWindowTimezone: s.withdrawalWindowTimezone ?? 'Etc/UTC',
    withdrawalAllowedWeekdays: normalizeWithdrawalAllowedWeekdays(s.withdrawalAllowedWeekdays),
    withdrawalProcessingIntervalHours: s.withdrawalProcessingIntervalHours ?? 48,
    withdrawalProcessingMode: s.withdrawalProcessingMode ?? 'manual',
    withdrawalCooldownHours: s.withdrawalCooldownHours ?? 78,
    withdrawalAmountStep: s.withdrawalAmountStep ?? 10,
    withdrawPackageCaps: s.withdrawPackageCaps ?? [],
    defaultWithdrawalPercentOfPackage: s.defaultWithdrawalPercentOfPackage ?? 20,
  }
}

export function withdrawalAmountStep(policy: WithdrawPolicy): number {
  return Math.max(1, Math.floor(Number(policy.withdrawalAmountStep ?? 10)))
}

/** Gross amount must be a whole multiple of `step` USDT (e.g. 10, 20, 30). */
export function isWithdrawalAmountStepValid(amount: number, step: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  const s = Math.max(1, Math.floor(Number(step) || 10))
  const cents = Math.round(amount * 100)
  return cents > 0 && cents % (s * 100) === 0
}

export function withdrawalCooldownHours(policy: WithdrawPolicy): number {
  return Math.max(0, Number(policy.withdrawalCooldownHours ?? 78))
}

export type WithdrawalCooldownState = {
  blocked: boolean
  nextEligibleAt: number | null
  lastWithdrawalAt: number | null
}

export function computeWithdrawalCooldown(
  lastCreatedMs: number | null,
  cooldownHours: number,
  nowMs = Date.now(),
): WithdrawalCooldownState {
  if (lastCreatedMs == null || cooldownHours <= 0) {
    return { blocked: false, nextEligibleAt: null, lastWithdrawalAt: lastCreatedMs }
  }
  const windowMs = cooldownHours * 3600000
  const nextEligibleAt = lastCreatedMs + windowMs
  if (nowMs >= nextEligibleAt) {
    return { blocked: false, nextEligibleAt: null, lastWithdrawalAt: lastCreatedMs }
  }
  return { blocked: true, nextEligibleAt, lastWithdrawalAt: lastCreatedMs }
}

/**
 * Per-user `withdrawalPolicySnapshot` may only override **package-based** withdrawal caps
 * (`withdrawPackageCaps`, `defaultWithdrawalPercentOfPackage`) captured at activation.
 * Min withdrawal, fee %, time window, cooldown, amount step, and enabled flags always follow live `siteSettings`.
 */
export function mergeWithdrawPolicy(live: WithdrawPolicy, frozen?: Record<string, unknown> | null): WithdrawPolicy {
  if (!frozen || typeof frozen !== 'object' || Object.keys(frozen).length === 0) {
    return { ...live }
  }
  const merged = { ...live }
  const caps = frozen.withdrawPackageCaps
  if (Array.isArray(caps) && caps.length > 0) {
    merged.withdrawPackageCaps = caps
  }
  const defPct = frozen.defaultWithdrawalPercentOfPackage
  if (defPct !== undefined && Number.isFinite(Number(defPct))) {
    merged.defaultWithdrawalPercentOfPackage = Number(defPct)
  }
  merged.withdrawalWindowStart = live.withdrawalWindowStart
  merged.withdrawalWindowEnd = live.withdrawalWindowEnd
  merged.withdrawalWindowTimezone = live.withdrawalWindowTimezone
  merged.withdrawalAllowedWeekdays = live.withdrawalAllowedWeekdays
  return merged
}

export function normalizeWithdrawalAllowedWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_WITHDRAWAL_ALLOWED_WEEKDAYS]
  const set = new Set<number>()
  for (const x of raw) {
    const n = Number(x)
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n)
  }
  if (set.size === 0) return [...DEFAULT_WITHDRAWAL_ALLOWED_WEEKDAYS]
  return [...set].sort((a, b) => a - b)
}

export function formatWithdrawalAllowedWeekdays(days: unknown): string {
  const sorted = normalizeWithdrawalAllowedWeekdays(days)
  if (sorted.length >= 7) return 'Every day'
  if (sorted.join(',') === '1,2,3,4,5,6') return 'Mon–Sat'
  if (sorted.join(',') === '0,1,2,3,4,5,6') return 'Sun–Sat'
  return sorted.map((d) => WEEKDAY_SHORT[d] ?? '?').join(', ')
}

export function weekdayInTimezone(date: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    const label = fmt.format(date)
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    const wd = map[label]
    return wd === undefined ? null : wd
  } catch {
    return null
  }
}

export function isWithdrawalDayAllowed(policy: WithdrawPolicy, date = new Date()): boolean {
  const days = normalizeWithdrawalAllowedWeekdays(policy.withdrawalAllowedWeekdays)
  if (days.length >= 7) return true
  const tz = String(policy.withdrawalWindowTimezone ?? 'Etc/UTC')
  const wd = weekdayInTimezone(date, tz)
  if (wd === null) return true
  return days.includes(wd)
}

export function wallClockMinutes(date: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      /** Avoid ambiguous 24h output across engines (esp. mobile Safari vs Node). */
      hourCycle: 'h23',
      calendar: 'gregory',
    })
    const parts = fmt.formatToParts(date)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  } catch {
    return null
  }
}

export function parseHmToMinutes(hm: string): number | null {
  const x = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim())
  if (!x) return null
  const hh = Number(x[1])
  const mm = Number(x[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null
  return hh * 60 + mm
}

export function isWithinWithdrawalWindow(policy: WithdrawPolicy, date = new Date()): boolean {
  const tz = String(policy.withdrawalWindowTimezone ?? 'Etc/UTC')
  const nowM = wallClockMinutes(date, tz)
  let s = parseHmToMinutes(String(policy.withdrawalWindowStart ?? '00:00'))
  let e = parseHmToMinutes(String(policy.withdrawalWindowEnd ?? '23:59'))
  if (nowM === null || s === null || e === null) return true
  if (s <= e) return nowM >= s && nowM <= e
  return nowM >= s || nowM <= e
}

/** Time window and allowed weekday (policy timezone) must both pass. */
export function isWithdrawalAllowedNow(policy: WithdrawPolicy, date = new Date()): boolean {
  return isWithinWithdrawalWindow(policy, date) && isWithdrawalDayAllowed(policy, date)
}

export function computeMaxWithdrawForPrincipal(principal: number, policy: WithdrawPolicy): number {
  if (principal <= 0) return 0
  const caps = Array.isArray(policy.withdrawPackageCaps)
    ? (policy.withdrawPackageCaps as WithdrawPackageCapRow[])
    : []
  const usable = caps.filter((row) => row && row.active !== false)
  const exact = usable.find((row) => Number(row.packageAmount ?? -999) === principal)
  if (exact != null) {
    if (exact.usePercentFormula) return (principal * Number(exact.percentOfPackage ?? 20)) / 100
    return Math.max(0, Number(exact.maxWithdrawal ?? 0))
  }
  const fallbackPct = Number(policy.defaultWithdrawalPercentOfPackage ?? 20)
  return (principal * fallbackPct) / 100
}

export function fmtNextAutoSummary(s: SiteSettings): string {
  const mode = s.withdrawalProcessingMode === 'auto' ? 'Automatic' : 'Manual admin'
  const hrs = s.withdrawalProcessingIntervalHours ?? 48
  const last = s.lastAutoWithdrawalRunAt
  if (s.withdrawalProcessingMode !== 'auto') return `${mode} — auto job idle`
  if (last == null || !Number.isFinite(last)) return `${mode} — target every ${hrs}h (no run recorded yet)`
  const next = last + hrs * 3600000
  return `${mode} — ~every ${hrs}h · last run ${new Date(last).toUTCString()} · next target ${new Date(next).toUTCString()}`
}
