import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import type { ReferralCampaignProgressResult } from '@/types/models'

export async function getReferralCampaignProgressCallable(): Promise<ReferralCampaignProgressResult> {
  const fn = getHttpsCallable('getReferralCampaignProgress')
  const res = await fn({})
  return res.data as ReferralCampaignProgressResult
}

export async function dismissReferralCampaignBannerCallable(campaignId: string): Promise<void> {
  const fn = getHttpsCallable('dismissReferralCampaignBanner')
  await fn({ campaignId })
}
