/** Mirrors Cloud Functions `splitTopupWalletDebit` — 50% activation / 50% deposit (cent-safe). */
export function splitTopupWalletDebit(amount: number): { activation: number; deposit: number } {
  const cents = Math.round(amount * 100)
  if (cents <= 0) return { activation: 0, deposit: 0 }
  const halfActCents = Math.floor(cents / 2)
  const halfDepCents = cents - halfActCents
  return { activation: halfActCents / 100, deposit: halfDepCents / 100 }
}
