export const DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT = 50
export const DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT = 50

/** Normalize admin-configured split; defaults to 50/50 when invalid. */
export function normalizePackageTopupSplitPercentages(
  activationPercent: unknown,
  depositPercent: unknown,
): { activationPercent: number; depositPercent: number } {
  let act = Number(activationPercent)
  let dep = Number(depositPercent)
  if (!Number.isFinite(act) || !Number.isFinite(dep)) {
    return {
      activationPercent: DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT,
      depositPercent: DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT,
    }
  }
  act = Math.min(100, Math.max(0, act))
  dep = Math.min(100, Math.max(0, dep))
  if (Math.abs(act + dep - 100) > 0.001) {
    return {
      activationPercent: DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT,
      depositPercent: DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT,
    }
  }
  return { activationPercent: act, depositPercent: dep }
}

/** Cent-safe debit split for package activation (mirrors Cloud Functions). */
export function splitTopupWalletDebit(
  amount: number,
  activationPercent = DEFAULT_PACKAGE_TOPUP_ACTIVATION_PERCENT,
  depositPercent = DEFAULT_PACKAGE_TOPUP_DEPOSIT_PERCENT,
): { activation: number; deposit: number } {
  const cents = Math.round(amount * 100)
  if (cents <= 0) return { activation: 0, deposit: 0 }
  const { activationPercent: actPct } = normalizePackageTopupSplitPercentages(activationPercent, depositPercent)
  const activationCents = Math.floor((cents * actPct) / 100)
  const depositCents = cents - activationCents
  return { activation: activationCents / 100, deposit: depositCents / 100 }
}

export function formatPackageTopupSplitLabel(activationPercent: number, depositPercent: number): string {
  return `${activationPercent}% / ${depositPercent}%`
}
