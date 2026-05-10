export type UserRole = 'user' | 'admin'

export interface UserWallets {
  deposit: number
  activation: number
  cash: number
}

export interface UserProfile {
  uid: string
  username: string
  email: string
  fullName: string
  phone: string
  sponsorUsername: string | null
  sponsorUid: string | null
  role: UserRole
  wallets: UserWallets
  totalWithdrawn: number
  activeDirects: number
  currentRank: string
  totalTeamBusiness: number
  nonWorkingIncomeBalance: number
  workingIncomeBalance: number
  sponsorBonusTotal: number
  dailyProfitsTotal: number
  teamLevelCommissionTotal: number
  rankCommissionTotal: number
  /** Optional profile fields (Firestore) */
  city?: string
  usdtBep20Address?: string
  /** True if server has a transaction PIN hash set */
  transactionPinSet?: boolean
  createdAt: number
  updatedAt: number
}

/** Row from `listDirectReferrals` callable */
export interface DirectReferralRow {
  username: string
  fullName: string
  phone: string
  createdAt: number
  amount: number
  volume: number
}

/** Row from `listAllDownlines` callable */
export interface DownlineRow {
  username: string
  fullName: string
  createdAt: number
  sponsorUsername: string
  packageAmount: number
  level: number
}

export type DepositStatus = 'pending' | 'approved' | 'rejected'

export interface DepositRequest {
  id: string
  userId: string
  amount: number
  status: DepositStatus
  proofUrl?: string
  createdAt: number
  reviewedAt?: number
  adminNote?: string
}

export type WithdrawStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface WithdrawRequest {
  id: string
  userId: string
  amountGross: number
  fee: number
  amountNet: number
  address: string
  status: WithdrawStatus
  txId?: string
  createdAt: number
}

export interface PackageDef {
  id: string
  name: string
  minAmount: number
  maxAmount: number
  roiPercent: number
  durationDays: number
  active: boolean
}

export interface ActivePackage {
  id: string
  userId: string
  packageId: string
  amount: number
  roiPercent: number
  durationDays: number
  startedAt: number
  endsAt: number
  nonWorkingPaid: number
  workingPaid: number
  status: 'active' | 'completed' | 'capped'
}

export interface SiteSettings {
  maintenanceMode: boolean
  depositWalletAddress: string
  depositNetwork: string
  minDeposit: number
  minWithdrawal: number
  withdrawFeePercent: number
  sponsorPercent: number
  teamLevelsCount: number
  qrCodeUrl?: string
  tickerSymbols?: string[]
}
