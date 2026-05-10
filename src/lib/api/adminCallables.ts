import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'

export async function adminWithdrawalUpdateCallable(payload: {
  withdrawalId: string
  next: 'processing' | 'approved' | 'rejected' | 'paid'
  txHash?: string
}) {
  const fn = getHttpsCallable('adminWithdrawalUpdate')
  await fn(payload)
}

export async function adminFinalizeDepositCallable(payload: {
  depositId: string
  decision: 'approved' | 'rejected'
  adminNote?: string
}): Promise<{ ok: boolean; credited: number }> {
  const fn = getHttpsCallable('adminFinalizeDeposit')
  const res = await fn(payload)
  return res.data as { ok: boolean; credited: number }
}

export async function adminBroadcastNotificationCallable(payload: { title: string; body: string }) {
  const fn = getHttpsCallable('adminBroadcastNotification')
  const res = await fn(payload)
  return res.data as { sent: number }
}
