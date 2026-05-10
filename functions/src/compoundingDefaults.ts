/**
 * Rich Compounding reference tiers (marketing grid). Fixed doc ids for idempotent admin seed.
 * ROI % approximates doubling principal over `durationDays` with daily compounding on balance.
 */
export function compoundRoiPercentForDoubleInDays(durationDays: number): number {
  const n = Math.max(1, durationDays)
  const r = Math.pow(2, 1 / n) - 1
  return Math.round(r * 1e6) / 1e4
}

export type CompoundPlanSeed = {
  id: string
  name: string
  amount: number
  durationDays: number
  maxRoiMultiplier: number
  sortOrder: number
}

const D = (amount: number, days: number, sortOrder: number): CompoundPlanSeed => ({
  id: `seed_compound_${amount}`,
  name: `Rich Compounding $${amount}`,
  amount,
  durationDays: days,
  maxRoiMultiplier: 2,
  sortOrder,
})

/** Default structure from spec: $500/30d … $100/50d, all 2× cap. */
export const REFERENCE_COMPOUNDING_PLANS: CompoundPlanSeed[] = [
  D(500, 30, 10),
  D(400, 35, 20),
  D(300, 40, 30),
  D(200, 45, 40),
  D(100, 50, 50),
]
