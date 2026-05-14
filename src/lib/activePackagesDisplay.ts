/**
 * Helpers for member UI: Firestore may still have `status: "active"` until jobs run, and admins
 * can pause ROI without changing status — treat those as non-live for totals / withdrawal hints.
 */
export function endsAtMillisFromDoc(d: Record<string, unknown>): number {
  const ends = d.endsAt
  if (ends && typeof (ends as { toMillis?: () => number }).toMillis === 'function') {
    return (ends as { toMillis: () => number }).toMillis()
  }
  const n = Number(ends ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** True when the package should count as “active” on the member dashboard (stake total, withdrawal principal, caps). */
export function isLiveActivePackage(d: Record<string, unknown>): boolean {
  if (String(d.status ?? 'active').toLowerCase() !== 'active') return false
  if (d.adminRoiPaused === true) return false
  const endMs = endsAtMillisFromDoc(d)
  if (Number.isFinite(endMs) && endMs > 0 && endMs <= Date.now()) return false
  return true
}
