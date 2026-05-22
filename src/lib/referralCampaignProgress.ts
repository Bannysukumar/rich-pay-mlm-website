import type { ReferralCampaignTierProgress } from '@/types/models'

export type ReferralTierBarHud = {
  joinPercent: number
  directPercent: number
  /** 100 only when both requirements satisfied (matches `completed`). */
  overallPercent: number
  showJoinBar: boolean
}

export function referralTierBarHud(tier: ReferralCampaignTierProgress): ReferralTierBarHud {
  const req = Math.max(1, tier.requiredDirectReferrals)
  const directPercent = tier.completed
    ? 100
    : Math.min(100, Math.round((tier.qualifyingDirectCount / req) * 100))

  const minAmt = Number(tier.minMemberPackageAmount ?? 0)
  const showJoinBar = minAmt > 0 || !tier.memberJoinMet

  let joinPercent = 100
  if (minAmt > 0) {
    joinPercent = tier.memberJoinMet
      ? 100
      : Math.min(100, Math.round((Math.max(0, tier.memberPrincipal) / minAmt) * 100))
  } else if (!tier.memberJoinMet) {
    joinPercent = 0
  }

  const overallPercent = tier.completed
    ? 100
    : Math.round(Math.min(joinPercent, directPercent))

  return { joinPercent, directPercent, overallPercent, showJoinBar }
}
