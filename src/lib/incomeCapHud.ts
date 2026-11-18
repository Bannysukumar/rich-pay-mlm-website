/** Member-facing summary: daily ROI upto 2×; referral extra upto 1×; package auto-ends at 2× daily, 3× total, or plan end. */

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
  const totalCap = roiCap + workingSoftCap
  const totalPaid = roiPaid + workingPaid
  const totalRemaining = Math.max(0, totalCap - totalPaid)
  const roiRoom = Math.max(0, roiCap - roiPaid)
  const roiRemaining = Math.min(roiRoom, totalRemaining)
  const softReferralLeft = Math.max(0, workingSoftCap - workingPaid)
  const referralExtraRemaining = Math.min(softReferralLeft, totalRemaining)
  /** Sponsor/team/rank stop when total 3× is full or package completed. */
  const workingRemaining = totalRemaining
  const workingCap = Math.max(workingPaid, totalCap - roiPaid)
  const allStopped = totalCap > 0 && totalRemaining <= 1e-9
  const workingStopped = allStopped
  const roiStopped = allStopped || (roiCap > 0 && roiRemaining <= 1e-9)
  const progressPct =
    totalCap > 1e-9 ? Math.min(100, Math.round((totalPaid / totalCap) * 1000) / 10) : 0

  let statusTitle = 'Income still open'
  let statusDetail = hasReferralPath
    ? 'While your package is active you can earn daily ROI (upto 2×) and referral income (extra upto 1×). The package becomes inactive automatically at 2× daily, 3× total, or plan end.'
    : 'Without referrals you earn daily ROI up to 2×. Your package becomes inactive when 2× daily is finished (or the plan ends). Refer members to unlock up to +1× more (total 3×).'

  if (activeStake <= 0) {
    statusTitle = 'No active package'
    statusDetail = 'Activate a package to start daily profit. Only one active package is allowed at a time.'
  } else if (allStopped) {
    statusTitle = 'Income limit reached — package inactive soon'
    statusDetail =
      'You have used the full income room on your active stake (3×). Activate a new package after this one is inactive.'
  } else if (roiStopped) {
    statusTitle = 'Daily ROI 2× finished'
    statusDetail =
      'Daily profit has reached its 2× share. Your package will be marked inactive automatically — activate a new package when ready.'
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
  }
}
