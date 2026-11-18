/** Member-facing summary: daily ROI per package upto 2×; referral counts on oldest active package only (its own 3×). */

export type ActiveStakeForCap = {
  liveActive: boolean
  amount: number
  nonWorkingPaid: number
  nwMult: number
  wMult: number
  packageName?: string
  startedAtMs?: number
  /** Working/referral income attributed to THIS package. */
  attributedWorkingIncome?: number
  id?: string
}

export type IncomeCapHud = {
  activeStake: number
  packageCount: number
  roiPaid: number
  roiCap: number
  workingPaid: number
  /** Soft 1× working band on the first (oldest) package only. */
  workingSoftCap: number
  /** Remaining referral room on the first package (capped by that package’s 3×). */
  referralExtraRemaining: number
  workingCap: number
  totalPaid: number
  totalCap: number
  totalRemaining: number
  roiRemaining: number
  workingRemaining: number
  roiStopped: boolean
  workingStopped: boolean
  allStopped: boolean
  hasReferralPath: boolean
  progressPct: number
  statusTitle: string
  statusDetail: string
  maxLabel: string
  /** Oldest active package label for referral UI. */
  firstPackageLabel: string
  firstPackageAmount: number
}

export function deriveIncomeCapHud(
  stakes: ActiveStakeForCap[],
  lifetimeWorkingIncome: number,
  opts?: { hasReferralPath?: boolean },
): IncomeCapHud {
  const active = stakes
    .filter((s) => s.liveActive)
    .slice()
    .sort((a, b) => (Number(a.startedAtMs) || 0) - (Number(b.startedAtMs) || 0))

  let activeStake = 0
  let packageCount = 0
  let roiPaid = 0
  let roiCap = 0
  for (const s of active) {
    const amt = Math.max(0, Number(s.amount) || 0)
    const nw = Math.max(0, Number(s.nwMult) || 0)
    packageCount += 1
    activeStake += amt
    roiPaid += Math.max(0, Number(s.nonWorkingPaid) || 0)
    roiCap += amt * nw
  }

  const first = active[0]
  const firstAmt = first ? Math.max(0, Number(first.amount) || 0) : 0
  const firstNw = first ? Math.max(0, Number(first.nwMult) || 0) : 0
  const firstW = first ? Math.max(0, Number(first.wMult) || 0) : 0
  const firstRoi = first ? Math.max(0, Number(first.nonWorkingPaid) || 0) : 0
  const firstAttrRaw = first ? Math.max(0, Number(first.attributedWorkingIncome) || 0) : 0
  const lifetimeWorking = Math.max(0, Number(lifetimeWorkingIncome) || 0)
  /** Prefer package-attributed; fall back to lifetime until backfill lands. */
  const firstAttr = firstAttrRaw > 1e-9 ? firstAttrRaw : lifetimeWorking
  const workingSoftCap = firstAmt * firstW
  const firstCeiling = firstAmt * (firstNw + firstW)
  const firstRoom = Math.max(0, firstCeiling - firstRoi - firstAttr)

  const hasReferralPath =
    opts?.hasReferralPath === true || lifetimeWorking > 1e-9 || firstAttrRaw > 1e-9

  const workingPaidShown = hasReferralPath ? Math.min(firstAttr, workingSoftCap) : 0
  const totalCap = hasReferralPath ? roiCap + workingSoftCap : roiCap
  const totalPaid = hasReferralPath ? roiPaid + workingPaidShown : roiPaid
  const totalRemaining = Math.max(0, totalCap - totalPaid)
  const roiRemaining = Math.max(0, roiCap - roiPaid)
  const softReferralLeft = hasReferralPath ? Math.max(0, workingSoftCap - workingPaidShown) : 0
  const referralExtraRemaining = hasReferralPath ? Math.min(softReferralLeft, firstRoom) : 0
  const workingRemaining = hasReferralPath ? firstRoom : 0
  const workingCap = hasReferralPath ? workingSoftCap : 0
  const workingStopped = hasReferralPath && firstRoom <= 1e-9
  const roiStopped = roiCap > 0 && roiRemaining <= 1e-9
  const allStopped = activeStake > 0 && roiStopped && (!hasReferralPath || workingStopped)
  const progressPct =
    totalCap > 1e-9 ? Math.min(100, Math.round((totalPaid / totalCap) * 1000) / 10) : 0
  const maxLabel = hasReferralPath
    ? '2× each · referral on first package'
    : '2× daily per package'
  const firstPackageLabel = first ? String(first.packageName || 'First package') : '—'

  let statusTitle = 'You can still earn'
  let statusDetail = hasReferralPath
    ? 'Daily profit is per package (upto 2×). Referral income counts only on your oldest active package (that package’s own 3×). When it is full, only that package closes; other packages keep their daily ROI.'
    : 'Each package pays daily profit up to 2×. Referral income will count on your oldest active package only.'

  if (activeStake <= 0) {
    statusTitle = 'No active package'
    statusDetail = 'Activate a package to start earning daily profit. You can activate more than one package.'
  } else if (workingStopped && !roiStopped) {
    statusTitle = 'First package referral limit reached'
    statusDetail =
      'Referral on your oldest package is full (or that package closed). Other packages can still earn daily profit up to 2×.'
  } else if (roiStopped && !hasReferralPath) {
    statusTitle = 'Daily profit finished on active plans'
    statusDetail =
      'Daily profit has reached 2× on your active package(s). Finished packages become inactive automatically.'
  }

  return {
    activeStake,
    packageCount,
    roiPaid,
    roiCap,
    workingPaid: workingPaidShown,
    workingSoftCap,
    referralExtraRemaining,
    workingCap,
    totalPaid,
    totalCap,
    totalRemaining,
    roiRemaining,
    workingRemaining,
    roiStopped,
    workingStopped,
    allStopped,
    hasReferralPath,
    progressPct,
    statusTitle,
    statusDetail,
    maxLabel,
    firstPackageLabel,
    firstPackageAmount: firstAmt,
  }
}
