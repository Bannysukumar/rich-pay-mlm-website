import type { SiteSettings, WithdrawPackageCapRow } from '@/types/models'

export type WithdrawPolicy = Record<string, unknown>

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
    withdrawalProcessingIntervalHours: s.withdrawalProcessingIntervalHours ?? 48,
    withdrawalProcessingMode: s.withdrawalProcessingMode ?? 'manual',
    withdrawPackageCaps: s.withdrawPackageCaps ?? [],
    defaultWithdrawalPercentOfPackage: s.defaultWithdrawalPercentOfPackage ?? 20,
  }
}

/**
 * Per-user `withdrawalPolicySnapshot` may only override **package-based** withdrawal caps
 * (`withdrawPackageCaps`, `defaultWithdrawalPercentOfPackage`) captured at activation.
 * Min withdrawal, fee %, time window, and enabled flags always follow live `siteSettings`.
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
  return merged
}

export function wallClockMinutes(date: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
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
