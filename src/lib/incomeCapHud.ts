/** Member-facing summary: daily ROI upto 2×; referral extra 1× only when referral path is active (else show 2× only). */

export type ActiveStakeForCap = {
  liveActive: boolean
  amount: number
  nonWorkingPaid: number
  nwMult: number
  wMult: number
  packageName?: string
}

export type IncomeCapHud = {
  activeStake: number
  packageCount: number
  roiPaid: number
  roiCap: number
  workingPaid: number
  /** Soft 1× working band (principal × working mult). */
  workingSoftCap: number
  /** Remaining dollars inside the soft 1× referral band (capped by total room). */
  referralExtraRemaining: number
  /** Max working income still possible if ROI stays at current paid (totalCap − roiPaid). */
  workingCap: number
  totalPaid: number
  totalCap: number
  totalRemaining: number
  roiRemaining: number
  workingRemaining: number
  roiStopped: boolean
  workingStopped: boolean
  allStopped: boolean
  /** True when member has directs or any working income (referral path unlocked in UI). */
  hasReferralPath: boolean
  progressPct: number
  statusTitle: string
  statusDetail: string
  /** Shown next to earned/max: "2×" or "3× (2× daily + 1× referral)". */
  maxLabel: string
}

export function deriveIncomeCapHud(
  stakes: ActiveStakeForCap[],
  lifetimeWorkingIncome: number,
  opts?: { hasReferralPath?: boolean },
): IncomeCapHud {
  let activeStake = 0
  let packageCount = 0
  let roiPaid = 0
  let roiCap = 0
  let workingSoftCap = 0
  for (const s of stakes) {
    if (!s.liveActive) continue
    const amt = Math.max(0, Number(s.amount) || 0)
    const nw = Math.max(0, Number(s.nwMult) || 0)
    const w = Math.max(0, Number(s.wMult) || 0)
    packageCount += 1
    activeStake += amt
    roiPaid += Math.max(0, Number(s.nonWorkingPaid) || 0)
    roiCap += amt * nw
    workingSoftCap += amt * w
  }
  const workingPaid = Math.max(0, Number(lifetimeWorkingIncome) || 0)
  const hasReferralPath = opts?.hasReferralPath === true || workingPaid > 1e-9

  // No referral yet → show daily 2× only. With referral → 2× daily + 1× referral = 3×.
  const totalCap = hasReferralPath ? roiCap + workingSoftCap : roiCap
  const totalPaid = hasReferralPath ? roiPaid + workingPaid : roiPaid
  const totalRemaining = Math.max(0, totalCap - totalPaid)
  const roiRoom = Math.max(0, roiCap - roiPaid)
  const roiRemaining = Math.min(roiRoom, totalRemaining)
  const softReferralLeft = hasReferralPath ? Math.max(0, workingSoftCap - workingPaid) : 0
  const referralExtraRemaining = hasReferralPath
    ? Math.min(softReferralLeft, totalRemaining)
    : 0
  const workingRemaining = hasReferralPath ? totalRemaining : 0
  const workingCap = hasReferralPath ? Math.max(workingPaid, totalCap - roiPaid) : 0
  const allStopped = totalCap > 0 && totalRemaining <= 1e-9
  const workingStopped = hasReferralPath && allStopped
  const roiStopped = allStopped || (roiCap > 0 && roiRemaining <= 1e-9)
  const progressPct =
    totalCap > 1e-9 ? Math.min(100, Math.round((totalPaid / totalCap) * 1000) / 10) : 0
  const maxLabel = hasReferralPath ? '3× (2× daily + 1× referral)' : '2× daily'

  let statusTitle = 'You can still earn'
  let statusDetail = hasReferralPath
    ? 'Each package pays its own daily profit (upto 2×). Because you have referrals, you can also earn extra upto +1× (total 3×). Packages stop at 2× daily, 3× total, or plan end.'
    : 'Each package pays daily profit up to 2× only. You can hold more than one package — each one is separate. Refer members to unlock +1× more (total 3×).'

  if (activeStake <= 0) {
    statusTitle = 'No active package'
    statusDetail = 'Activate a package to start earning daily profit. You can activate more than one package.'
  } else if (allStopped) {
    statusTitle = 'Limit reached'
    statusDetail = hasReferralPath
      ? 'You have earned the full 3× on your active packages. Activate another package to continue.'
      : 'You have earned the full 2× daily on your active packages. Activate another package, or refer members to unlock +1× more.'
  } else if (roiStopped) {
    statusTitle = 'Daily profit finished on active plans'
    statusDetail = hasReferralPath
      ? 'Daily profit has reached 2× on your active package(s). Referral income can still fill the extra 1× until total 3×.'
      : 'Daily profit has reached 2× on your active package(s). Finished packages become inactive automatically.'
  }

  return {
    activeStake,
    packageCount,
    roiPaid,
    roiCap,
    workingPaid,
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
  }
}
