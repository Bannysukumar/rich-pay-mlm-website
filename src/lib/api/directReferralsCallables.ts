import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import type { DirectReferralRow } from '@/types/models'

export async function listDirectReferrals(): Promise<{ referrals: DirectReferralRow[] }> {
  const fn = getHttpsCallable('listDirectReferrals')
  const res = await fn({})
  return res.data as { referrals: DirectReferralRow[] }
}
