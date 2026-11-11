/** Member-facing summary of the 3× income rule (ROI hard-capped at 2×; team income until total 3×). */

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
  progressPct: number
  statusTitle: string
  statusDetail: string
}

export function deriveIncomeCapHud(
  stakes: ActiveStakeForCap[],
  lifetimeWorkingIncome: number,
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
  const totalCap = roiCap + workingSoftCap
  const totalPaid = roiPaid + workingPaid
  const totalRemaining = Math.max(0, totalCap - totalPaid)
  const roiRoom = Math.max(0, roiCap - roiPaid)
  const roiRemaining = Math.min(roiRoom, totalRemaining)
  /** Sponsor/team/rank only stop when total 3× is full — not at the soft 1× snapshot. */
  const workingRemaining = totalRemaining
  const workingCap = Math.max(workingPaid, totalCap - roiPaid)
  const allStopped = totalCap > 0 && totalRemaining <= 1e-9
  const workingStopped = allStopped
  const roiStopped = allStopped || (roiCap > 0 && roiRemaining <= 1e-9)
  const progressPct =
    totalCap > 1e-9 ? Math.min(100, Math.round((totalPaid / totalCap) * 1000) / 10) : 0

  let statusTitle = 'Income still open'
  let statusDetail =
    'Daily profit can continue until its 2× part is full. Sponsor, team level, and rank can continue until your total reaches 3×. Everything stops at 3× your active packages.'

  if (activeStake <= 0) {
    statusTitle = 'No active package'
    statusDetail = 'Activate a package to start daily profit and referral income.'
  } else if (allStopped) {
    statusTitle = '3× limit reached — all income stopped'
    statusDetail =
      'You have already received the full 3× on your active packages. No more income until you add a new package.'
  } else if (roiStopped && !workingStopped) {
    statusTitle = 'Daily profit paused'
    statusDetail =
      'Daily profit on your active packages has reached its 2× share. Sponsor / team / rank income can still continue until your total reaches 3×.'
  }

  return {
    activeStake,
    packageCount,
    roiPaid,
    roiCap,
    workingPaid,
    workingCap,
    totalPaid,
    totalCap,
    totalRemaining,
    roiRemaining,
    workingRemaining,
    roiStopped,
    workingStopped,
    allStopped,
    progressPct,
    statusTitle,
    statusDetail,
  }
}
