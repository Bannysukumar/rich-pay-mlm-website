import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import type { ReferralCampaignCompletionsResult } from '@/types/models'

/** Must match `ADMIN_ADJUST_BALANCE_FIELDS` in Cloud Functions `adminAdjustMemberBalances`. */
export type AdminAdjustMemberBalanceField =
  | 'wallet_deposit'
  | 'wallet_activation'
  | 'wallet_cash'
  | 'nonWorkingIncomeBalance'
  | 'workingIncomeBalance'
  | 'userTotals_totalWorkingIncome'
  | 'sponsorBonusTotal'
  | 'dailyProfitsTotal'
  | 'teamLevelCommissionTotal'
  | 'rankCommissionTotal'

export type BulkWalletKey = 'deposit' | 'activation' | 'cash'

export type BulkWalletTransferPreview = {
  totalUsers: number
  usersWithBalance: number
  totalAmount: number
  fromWallet: BulkWalletKey
  toWallet: BulkWalletKey
  maintenanceMode: boolean
}

export type BulkWalletTransferResult = BulkWalletTransferPreview & {
  ok: boolean
  usersProcessed: number
}

export async function adminAdjustMemberBalancesCallable(payload: {
  userId: string
  field: AdminAdjustMemberBalanceField
  delta: number
}): Promise<{ ok: boolean }> {
  const fn = getHttpsCallable('adminAdjustMemberBalances')
  const res = await fn(payload)
  return res.data as { ok: boolean }
}

export async function adminUpdateMemberContactCallable(payload: {
  userId: string
  email?: string
  phone?: string
}): Promise<{ ok: boolean; emailChanged?: boolean; phoneChanged?: boolean }> {
  const fn = getHttpsCallable('adminUpdateMemberContact')
  const res = await fn(payload)
  return res.data as { ok: boolean; emailChanged?: boolean; phoneChanged?: boolean }
}

export async function adminDeleteMemberCallable(payload: { userId: string }): Promise<{ ok: boolean }> {
  const fn = getHttpsCallable('adminDeleteMember')
  const res = await fn(payload)
  return res.data as { ok: boolean }
}

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

export async function adminListReferralCampaignCompletionsCallable(payload: {
  campaignId: string
  tierId?: string
}): Promise<ReferralCampaignCompletionsResult> {
  const fn = getHttpsCallable('adminListReferralCampaignCompletions')
  const res = await fn(payload)
  return res.data as ReferralCampaignCompletionsResult
}

export async function adminPreviewBulkWalletTransferCallable(payload: {
  fromWallet: BulkWalletKey
  toWallet: BulkWalletKey
}): Promise<BulkWalletTransferPreview> {
  const fn = getHttpsCallable('adminPreviewBulkWalletTransfer')
  const res = await fn(payload)
  return res.data as BulkWalletTransferPreview
}

export async function adminBulkWalletTransferCallable(payload: {
  fromWallet: BulkWalletKey
  toWallet: BulkWalletKey
  confirmPhrase: string
}): Promise<BulkWalletTransferResult> {
  const fn = getHttpsCallable('adminBulkWalletTransfer')
  const res = await fn(payload)
  return res.data as BulkWalletTransferResult
}
