import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'

export async function updateMemberProfile(payload: {
  fullName: string
  phone: string
  city: string
  usdtBep20Address: string
  transactionPassword?: string
}): Promise<{ ok: boolean }> {
  const fn = getHttpsCallable('updateMemberProfile')
  const res = await fn(payload)
  return res.data as { ok: boolean }
}

export async function changeTransactionPasswordCallable(payload: {
  currentPassword?: string
  newPassword: string
}): Promise<{ ok: boolean }> {
  const fn = getHttpsCallable('changeTransactionPassword')
  const res = await fn(payload)
  return res.data as { ok: boolean }
}
