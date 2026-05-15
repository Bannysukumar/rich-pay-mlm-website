/**
 * Reference compensation grid (marketing PDF / admin “install defaults”).
 * Team level doc IDs: seed_lvl_<n>. Rank doc IDs: seed_rank_giant_<n>.
 */

/** Default % of downline plan length (days) for upline team-level payout window (missing field uses same in functions). */
export const DEFAULT_UPLINE_DURATION_CAP_PERCENT = 50

export type TeamLevelSeedRow = {
  id: string
  level: number
  percent: number
  requiredDirects: number
  conditionDescription: string
  sortOrder: number
  /** 0–100: upline earns this level for first (planDays × value / 100) days of downline plan (100 = full plan length). */
  uplineDurationCapPercent: number
}

function buildTeamSeed(): TeamLevelSeedRow[] {
  const out: TeamLevelSeedRow[] = []
  out.push({
    id: 'seed_lvl_1',
    level: 1,
    percent: 30,
    requiredDirects: 0,
    conditionDescription: 'No condition',
    sortOrder: 10,
    uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
  })
  out.push({
    id: 'seed_lvl_2',
    level: 2,
    percent: 20,
    requiredDirects: 2,
    conditionDescription: 'At least 2 active direct referrals',
    sortOrder: 20,
    uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
  })
  out.push({
    id: 'seed_lvl_3',
    level: 3,
    percent: 10,
    requiredDirects: 3,
    conditionDescription: 'At least 3 active direct referrals',
    sortOrder: 30,
    uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
  })
  out.push({
    id: 'seed_lvl_4',
    level: 4,
    percent: 6,
    requiredDirects: 4,
    conditionDescription: 'At least 4 active direct referrals',
    sortOrder: 40,
    uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
  })
  out.push({
    id: 'seed_lvl_5',
    level: 5,
    percent: 4,
    requiredDirects: 5,
    conditionDescription: 'At least 5 active direct referrals',
    sortOrder: 50,
    uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
  })
  for (let l = 6; l <= 10; l++) {
    out.push({
      id: `seed_lvl_${l}`,
      level: l,
      percent: 3,
      requiredDirects: 6,
      conditionDescription: 'At least 6 active direct referrals',
      sortOrder: 50 + l * 10,
      uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
    })
  }
  for (let l = 11; l <= 20; l++) {
    out.push({
      id: `seed_lvl_${l}`,
      level: l,
      percent: 2,
      requiredDirects: 7,
      conditionDescription: 'At least 7 active direct referrals',
      sortOrder: 150 + l * 5,
      uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
    })
  }
  for (let l = 21; l <= 30; l++) {
    out.push({
      id: `seed_lvl_${l}`,
      level: l,
      percent: 1,
      requiredDirects: 8,
      conditionDescription: 'At least 8 active direct referrals',
      sortOrder: 250 + l * 5,
      uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
    })
  }
  return out
}

export const REFERENCE_TEAM_LEVEL_SEED = buildTeamSeed()

export const REFERENCE_RANK_SEED: Array<{
  id: string
  name: string
  requiredTeamBusiness: number
  dailyReward: number
  rewardDurationDays: number
  totalReward: number
  sortOrder: number
}> = [
  {
    id: 'seed_rank_giant_1',
    name: 'Giant - 1',
    requiredTeamBusiness: 5000,
    dailyReward: 5,
    rewardDurationDays: 20,
    totalReward: 100,
    sortOrder: 10,
  },
  {
    id: 'seed_rank_giant_2',
    name: 'Giant - 2',
    requiredTeamBusiness: 20000,
    dailyReward: 20,
    rewardDurationDays: 30,
    totalReward: 600,
    sortOrder: 20,
  },
  {
    id: 'seed_rank_giant_3',
    name: 'Giant - 3',
    requiredTeamBusiness: 50000,
    dailyReward: 50,
    rewardDurationDays: 40,
    totalReward: 2000,
    sortOrder: 30,
  },
  {
    id: 'seed_rank_giant_4',
    name: 'Giant - 4',
    requiredTeamBusiness: 100000,
    dailyReward: 100,
    rewardDurationDays: 50,
    totalReward: 5000,
    sortOrder: 40,
  },
  {
    id: 'seed_rank_giant_5',
    name: 'Giant - 5',
    requiredTeamBusiness: 250000,
    dailyReward: 250,
    rewardDurationDays: 60,
    totalReward: 15000,
    sortOrder: 50,
  },
  {
    id: 'seed_rank_giant_6',
    name: 'Giant - 6',
    requiredTeamBusiness: 500000,
    dailyReward: 500,
    rewardDurationDays: 80,
    totalReward: 40000,
    sortOrder: 60,
  },
  {
    id: 'seed_rank_giant_7',
    name: 'Giant - 7',
    requiredTeamBusiness: 1000000,
    dailyReward: 1000,
    rewardDurationDays: 100,
    totalReward: 100000,
    sortOrder: 70,
  },
]
