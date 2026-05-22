export const USERNAME_START = 4448550

/** Default upline team-level duration cap (% of downline plan days). Sync with functions `compensationDefaults`. */
export const DEFAULT_UPLINE_DURATION_CAP_PERCENT = 50

export const COLLECTIONS = {
  users: 'users',
  usersByUsername: 'usersByUsername',
  counters: 'counters',
  packages: 'packages',
  activePackages: 'activePackages',
  deposits: 'deposits',
  topups: 'topups',
  withdrawals: 'withdrawals',
  walletTransactions: 'walletTransactions',
  internalTransfers: 'internalTransfers',
  dailyProfits: 'dailyProfits',
  sponsorBonuses: 'sponsorBonuses',
  teamLevelBonuses: 'teamLevelBonuses',
  rankBonuses: 'rankBonuses',
  ranks: 'ranks',
  teamLevels: 'teamLevels',
  tickets: 'tickets',
  ticketReplies: 'ticketReplies',
  notifications: 'notifications',
  cmsPages: 'cmsPages',
  siteSettings: 'siteSettings',
  seoSettings: 'seoSettings',
  auditLogs: 'auditLogs',
  phones: 'phoneIndex',
  referralCampaigns: 'referralCampaigns',
} as const
