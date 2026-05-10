import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'

export async function resolveUsernameCallable(username: string): Promise<{ fullName: string }> {
  const fn = getHttpsCallable('resolveUsername')
  const res = await fn({ username })
  return res.data as { fullName: string }
}

export async function activatePackageCallable(payload: {
  packageId: string
  amount: number
  beneficiaryUsername?: string
  transactionPassword?: string
  planType?: number
}): Promise<{ activePackageId: string }> {
  const fn = getHttpsCallable('activatePackage')
  const res = await fn(payload)
  return res.data as { activePackageId: string }
}

export async function createWithdrawalCallable(payload: {
  amount: number
  address: string
  transactionPassword?: string
}): Promise<{ withdrawalId: string }> {
  const fn = getHttpsCallable('createWithdrawal')
  const res = await fn(payload)
  return res.data as { withdrawalId: string }
}

export async function walletConvertCallable(payload: {
  from: 'deposit' | 'activation' | 'cash'
  to: 'deposit' | 'activation' | 'cash'
  amount: number
}): Promise<void> {
  const fn = getHttpsCallable('walletConvert')
  await fn(payload)
}

export async function convertIncomeToActivationCallable(payload: {
  beneficiaryUsername: string
  amount: number
  transactionPassword?: string
}): Promise<void> {
  const fn = getHttpsCallable('convertIncomeToActivation')
  await fn(payload)
}

export async function internalTransferCallable(payload: {
  recipientUsername: string
  amount: number
  transactionPassword?: string
}): Promise<void> {
  const fn = getHttpsCallable('internalTransfer')
  await fn(payload)
}
