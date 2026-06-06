export type UserRole = 'user' | 'admin'

export interface UserWallets {
  deposit: number
  activation: number
  cash: number
}

/** Frozen rows on the user from the latest package activation (rank / ratio / team matrix). */
export type RankCompensationSnapshot = {
  teamLevels?: unknown[]
  ranks: Array<{
    id: string
    name: string
    requiredTeamBusiness: number
    dailyReward?: number
    rewardDurationDays?: number
    totalReward?: number
    sortOrder?: number
  }>
  rankQualificationPowerPercent?: number
  rankQualificationRestPercent?: number
  planSettingsVersionAtCapture?: number
  capturedAtMillis?: number
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
  /** When true member routes should bounce to login unless cleared by admin */
  blocked?: boolean
  wallets: UserWallets
  totalWithdrawn: number
  activeDirects: number
  currentRank: string
  totalTeamBusiness: number
  powerTeamBusiness: number
  restTeamBusiness: number
  nonWorkingIncomeBalance: number
  workingIncomeBalance: number
  totalWorkingIncome?: number
  sponsorBonusTotal: number
  dailyProfitsTotal: number
  teamLevelCommissionTotal: number
  rankCommissionTotal: number
  /** Sequential rank reward drip (matches Cloud Functions scheduler). */
  rankRewardActive?: boolean
  rankRewardDaysPaid?: number
  rankRewardTotalDays?: number
  completedRankRewardIds?: string[]
  rankCompensationSnapshot?: RankCompensationSnapshot | null
  /** Copied from latest package activation for withdrawal validation / UI. */
  withdrawalPolicySnapshot?: Record<string, unknown> | null
  /** Optional profile fields (Firestore) */
  city?: string
  usdtBep20Address?: string
  /** True if server has a transaction PIN hash set */
  transactionPinSet?: boolean
  /** campaignId → dismissed banner version (dashboard promo). */
  dismissedReferralCampaignBanners?: Record<string, number>
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

export type WithdrawStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'paid'

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

export type PackageShelf = 'investment' | 'compounding'

export interface PackageDef {
  id: string
  name: string
  minAmount: number
  maxAmount: number
  roiPercent: number
  durationDays: number
  active: boolean
  /** Storefront lane: classic daily tiers vs Rich Compounding. */
  packageShelf?: PackageShelf
  /** Lower sorts first when listing packages for members (admin-managed). */
  sortOrder?: number
  /** Non-working (daily ROI) income ceiling as multiple of principal (e.g. 2 = up to 2× stake). */
  maxRoiMultiplier?: number
  /**
   * Working (sponsor / team / rank allocation) ceiling as multiple of this package amount.
   * When omitted, new activations use site `workingIncomeCapMultiplier` from settings.
   */
  workingIncomeCapMultiplier?: number
}

/** Admin-configurable per-tier withdrawal cap (Firestore `withdrawPackageCaps` on siteSettings/config). */
export type WithdrawPackageCapRow = {
  packageAmount: number
  maxWithdrawal: number
  usePercentFormula: boolean
  percentOfPackage: number
  active: boolean
  sortOrder: number
}

/** Immutable capture at activation — all accruals use this + top-level frozen multipliers. */
export type PlanActivationSnapshot = Record<string, unknown>

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
  /** Sponsor bonus paid at activation (counts toward upline 3× ceiling); team level is from daily ROI. */
  workingPaid: number
  workingIncomeEarned?: number
  status: 'active' | 'completed' | 'capped'
  /** Set when non-working (daily) ROI has reached its cap; package may still be `active` for working income until `endsAt`. */
  nonWorkingRoiSaturated?: boolean
  /** When true, `processDailyRoi` skips this package (no ROI, no team-level share from its ROI). */
  adminRoiPaused?: boolean
  frozenNonWorkingCapMultiplier?: number
  frozenWorkingCapMultiplier?: number
  planSnapshot?: PlanActivationSnapshot
}

export interface SiteSettings {
  maintenanceMode: boolean
  siteName?: string
  currencyLabel?: string
  timezone?: string
  supportEmail?: string
  supportWhatsapp?: string
  logoUrl?: string
  faviconUrl?: string
  socialTelegram?: string
  socialTwitter?: string
  depositWalletAddress: string
  depositNetwork: string
  depositInstructions?: string
  minDeposit: number
  minWithdrawal: number
  withdrawFeePercent: number
  sponsorPercent: number
  teamLevelsCount: number
  /** Bumps when admin changes compensation rules affecting new activations (optional). */
  planSettingsVersion?: number
  /** Non-working (daily ROI) payout cap as multiple of principal (default 2). */
  nonWorkingIncomeCapMultiplier?: number
  /** Working (sponsor + team) payout cap as multiple of activation amount (default 3). */
  workingIncomeCapMultiplier?: number
  /**
   * When true, once cumulative working income (sponsor+team+rank) reaches the user's 3× ceiling,
   * the ROI scheduler skips that member's ROI and rank drip stops paying (new activations still snapshot flag).
   */
  stopAllIncomeWhenWorkingCapReached?: boolean
  /** Gate member withdrawal requests (`createWithdrawal`). */
  withdrawalsEnabled?: boolean
  withdrawNetworkLabel?: string
  /** IANA TZ for withdrawal window (e.g. Etc/UTC, Asia/Kolkata). */
  withdrawalWindowTimezone?: string
  withdrawalWindowStart?: string
  withdrawalWindowEnd?: string
  /** Weekdays when withdrawals are allowed (0=Sun … 6=Sat). Default Mon–Sat: [1,2,3,4,5,6]. */
  withdrawalAllowedWeekdays?: number[]
  withdrawalRequiresActivePackage?: boolean
  withdrawalProcessingIntervalHours?: number
  withdrawalProcessingMode?: 'manual' | 'auto'
  /** Hours after a non-rejected withdrawal before the member may request again (default 78). */
  withdrawalCooldownHours?: number
  /** Withdrawal gross amount must be a multiple of this step (default 10 USDT). */
  withdrawalAmountStep?: number
  defaultWithdrawalPercentOfPackage?: number
  withdrawPackageCaps?: WithdrawPackageCapRow[]
  withdrawPoliciesVersion?: number
  lastAutoWithdrawalRunAt?: number
  /** When false, skips `processDailyRankRewards` scheduler. */
  rankRewardsEnabled?: boolean
  /** Power-leg share of total team business required for rank milestones (paired with Rest). Default 50. */
  rankQualificationPowerPercent?: number
  /** Rest-leg share for rank milestones. Default 50. */
  rankQualificationRestPercent?: number
  /** Global ROI cron / accruals flag (cron still needed server-side). */
  roiEnabled?: boolean
  /** IST calendar days (YYYY-MM-DD) with no daily ROI or team-level commission from the nightly cron. */
  roiOffDates?: string[]
  roiProcessHourUtc?: number
  /** Percent of package amount debited from activation wallet on top-up (must sum to 100 with deposit %). */
  packageTopupActivationPercent?: number
  /** Percent of package amount debited from deposit wallet on top-up. */
  packageTopupDepositPercent?: number
  qrCodeUrl?: string
  tickerSymbols?: string[]
  /** Transfer / conversion guardrails surfaced in dashboards. */
  allowPeerActivationTransfer?: boolean
  /**
   * When true, activation-wallet peer transfers may go to any existing member UserID.
   * When false or unset, recipient must be the caller’s direct referral (sponsorUid === caller).
   */
  allowActivationTransferToAnyUser?: boolean
  allowIncomeToActivation?: boolean
  /**
   * When false, members do not see the Deposit → Activation block on `/dashboard/wallet/convert`
   * and `walletConvert` rejects deposit→activation.
   */
  depositToActivationConvertEnabled?: boolean
  /**
   * When true, package top-up UserID must be the caller or a direct referral (sponsorUid === caller).
   * When false or unset, any existing member UserID may receive the top-up. Default: unrestricted.
   */
  restrictPackageTopupToDirectReferrals?: boolean
  internalTransferFeePercent?: number
  minActivationTransfer?: number
  /** Optional marketing copy for public `/plans` (plain text). */
  publicPlansSponsorBody?: string
  publicPlansSponsorPill?: string
  publicPlansTeamLead?: string
  publicPlansRankFootnote?: string
  publicPlansGuidelineExtra?: string
  /** Public `/contact`: SLA line (e.g. "Within 2–4 hours"). */
  publicContactResponseTime?: string
  /** Optional hero subtitle on `/contact`. */
  publicContactHeroSub?: string
  /** Optional footer blurb column on `/contact`. */
  publicContactFooterNote?: string
  /** WhatsApp referral invite text; use `{{referralLink}}` for the member’s signup URL. */
  referralWhatsappShareTemplate?: string
  /** Optional promo image shown on referral hub + attached on share when supported. */
  referralWhatsappShareImageUrl?: string
}

/** One reward tier inside a referral promo campaign (e.g. flyer). */
export interface ReferralCampaignTier {
  id: string
  sortOrder: number
  rewardLabel: string
  /** Marketing line, e.g. "$200 Join". */
  rewardSubtitle?: string
  /** Member must have active package principal ≥ this (e.g. 200, 300). */
  minMemberPackageAmount?: number
  requiredDirectReferrals: number
  requireMemberActivePackage?: boolean
  requireDirectActivePackage?: boolean
  /** Count only directs who registered between campaign start and end. */
  directMustRegisterInCampaignWindow?: boolean
}

/** Admin-managed referral reward campaign (`referralCampaigns` collection). */
export interface ReferralCampaign {
  id: string
  title: string
  subtitle?: string
  theme?: string
  active: boolean
  startAt: number
  endAt: number
  tiers: ReferralCampaignTier[]
  bannerEnabled: boolean
  bannerTitle?: string
  bannerMessage: string
  bannerImageUrl?: string
  /** Bump when admin changes banner so dismissed users see it again. */
  bannerDismissVersion: number
  updatedAt: number
}

/** Callable `getReferralCampaignProgress` tier row. */
export interface ReferralCampaignTierProgress {
  tierId: string
  sortOrder: number
  rewardLabel: string
  rewardSubtitle?: string
  minMemberPackageAmount?: number
  requiredDirectReferrals: number
  qualifyingDirectCount: number
  memberPrincipal: number
  memberJoinMet: boolean
  completed: boolean
  progressPercent: number
}

export interface ReferralCampaignProgressResult {
  campaign: ReferralCampaign | null
  qualifyingDirectCount: number
  memberPrincipal: number
  tiers: ReferralCampaignTierProgress[]
}

/** Row from `adminListReferralCampaignCompletions` for fulfilled reward tiers. */
export interface ReferralCampaignCompletionRow {
  uid: string
  username: string
  fullName: string
  email: string
  phone: string
  tierId: string
  rewardLabel: string
  rewardSubtitle?: string
  qualifyingDirectCount: number
  memberPrincipal: number
}

export interface ReferralCampaignCompletionsResult {
  campaign: { id: string; title: string }
  completions: ReferralCampaignCompletionRow[]
  total: number
}
