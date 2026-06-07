import { createHash } from 'node:crypto'
import * as admin from 'firebase-admin'
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  REFERENCE_COMPOUNDING_PLANS,
  compoundRoiPercentForDoubleInDays,
} from './compoundingDefaults'
import {
  DEFAULT_UPLINE_DURATION_CAP_PERCENT,
  REFERENCE_RANK_SEED,
  REFERENCE_TEAM_LEVEL_SEED,
} from './compensationDefaults'

admin.initializeApp()
const db = admin.firestore()

/**
 * Gen-2 callables sit behind Cloud Run. `invoker: 'public'` avoids 403 on OPTIONS preflight.
 * Explicit origins help when the web app calls `*.cloudfunctions.net` directly (e.g. before
 * Hosting `/api/call/*` rewrites). Production should prefer same-origin `/api/call/:name` (see
 * `httpsCallableHelper` + `firebase.json`).
 */
const callableRuntimeOpts = {
  cors: [
    'https://richpay.live',
    'https://www.richpay.live',
    'https://richpay-live-fe3f1.web.app',
    'https://richpay-live-fe3f1.firebaseapp.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ],
  invoker: 'public' as const,
}

const USERNAME_START = 4448550
const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'
const COL_COUNTERS = 'counters'
const COL_PHONE = 'phoneIndex'
const COL_SETTINGS = 'siteSettings'
const COL_PACKAGES = 'packages'
const COL_ACTIVE = 'activePackages'
const COL_DEPOSITS = 'deposits'
const COL_WITHDRAWALS = 'withdrawals'
const COL_DAILY = 'dailyProfits'
const COL_INTERNAL = 'internalTransfers'

/**
 * When `allowActivationTransferToAnyUser` is on, treat package top-up the same as activation
 * transfers: any valid member UserID may receive the package (matches admin expectation on
 * Transfer settings). When that flag is off, `restrictPackageTopupToDirectReferrals === true`
 * limits beneficiaries to self + direct referrals only.
 */
function enforcePackageTopupDirectReferralOnly(settings: Record<string, unknown> | undefined): boolean {
  const s = settings ?? {}
  if (Boolean(s.allowActivationTransferToAnyUser)) return false
  return s.restrictPackageTopupToDirectReferrals === true
}
const COL_TEAM_LEVELS = 'teamLevels'
const COL_RANKS = 'ranks'
const COL_REFERRAL_CAMPAIGNS = 'referralCampaigns'

const REFERENCE_WITHDRAW_PACKAGE_CAPS_SEED = [
  { packageAmount: 100, maxWithdrawal: 20, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 10 },
  { packageAmount: 200, maxWithdrawal: 40, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 20 },
  { packageAmount: 300, maxWithdrawal: 60, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 30 },
  { packageAmount: 400, maxWithdrawal: 80, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 40 },
  { packageAmount: 500, maxWithdrawal: 100, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 50 },
]

function freezeWithdrawPolicyFromSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return {
    withdrawPoliciesVersion: Number(settings.withdrawPoliciesVersion ?? 0),
    withdrawalsEnabled: settings.withdrawalsEnabled !== false,
    withdrawalRequiresActivePackage: settings.withdrawalRequiresActivePackage !== false,
    withdrawNetworkLabel: String(settings.withdrawNetworkLabel ?? settings.depositNetwork ?? 'USDT BEP-20'),
    minWithdrawal: Number(settings.minWithdrawal ?? 10),
    withdrawFeePercent: Number(settings.withdrawFeePercent ?? 10),
    withdrawalWindowStart: String(settings.withdrawalWindowStart ?? '10:30'),
    withdrawalWindowEnd: String(settings.withdrawalWindowEnd ?? '13:30'),
    withdrawalWindowTimezone: String(settings.withdrawalWindowTimezone ?? 'Etc/UTC'),
    withdrawalAllowedWeekdays: normalizeWithdrawalAllowedWeekdays(settings.withdrawalAllowedWeekdays),
    withdrawalProcessingIntervalHours: Number(settings.withdrawalProcessingIntervalHours ?? 48),
    withdrawalProcessingMode: String(settings.withdrawalProcessingMode ?? 'manual'),
    withdrawalCooldownHours: Number(settings.withdrawalCooldownHours ?? 78),
    withdrawalAmountStep: Number(settings.withdrawalAmountStep ?? 10),
    withdrawPackageCaps: Array.isArray(settings.withdrawPackageCaps) ? settings.withdrawPackageCaps : [],
    defaultWithdrawalPercentOfPackage: Number(settings.defaultWithdrawalPercentOfPackage ?? 20),
  }
}

/** Keep in sync with `mergeWithdrawPolicy` in `src/lib/withdrawPolicy.ts`. */
function mergeWithdrawPolicyForUser(
  livePol: Record<string, unknown>,
  frozen?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!frozen || typeof frozen !== 'object' || Object.keys(frozen).length === 0) {
    return { ...livePol }
  }
  const merged = { ...livePol }
  const caps = frozen.withdrawPackageCaps
  if (Array.isArray(caps) && caps.length > 0) {
    merged.withdrawPackageCaps = caps
  }
  const defPct = frozen.defaultWithdrawalPercentOfPackage
  if (defPct !== undefined && Number.isFinite(Number(defPct))) {
    merged.defaultWithdrawalPercentOfPackage = Number(defPct)
  }
  /** Withdrawal time window always follows live site settings (never activation snapshot). */
  merged.withdrawalWindowStart = livePol.withdrawalWindowStart
  merged.withdrawalWindowEnd = livePol.withdrawalWindowEnd
  merged.withdrawalWindowTimezone = livePol.withdrawalWindowTimezone
  merged.withdrawalAllowedWeekdays = livePol.withdrawalAllowedWeekdays
  return merged
}

const DEFAULT_WITHDRAWAL_ALLOWED_WEEKDAYS = [1, 2, 3, 4, 5, 6]

function normalizeWithdrawalAllowedWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_WITHDRAWAL_ALLOWED_WEEKDAYS]
  const set = new Set<number>()
  for (const x of raw) {
    const n = Number(x)
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n)
  }
  if (set.size === 0) return [...DEFAULT_WITHDRAWAL_ALLOWED_WEEKDAYS]
  return [...set].sort((a, b) => a - b)
}

function weekdayInTimezone(date: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    const label = fmt.format(date)
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    const wd = map[label]
    return wd === undefined ? null : wd
  } catch {
    return null
  }
}

function isWithdrawalDayAllowed(policy: Record<string, unknown>, date = new Date()): boolean {
  const days = normalizeWithdrawalAllowedWeekdays(policy.withdrawalAllowedWeekdays)
  if (days.length >= 7) return true
  const tz = String(policy.withdrawalWindowTimezone ?? 'Etc/UTC')
  const wd = weekdayInTimezone(date, tz)
  if (wd === null) return true
  return days.includes(wd)
}

function wallClockMinutes(date: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      hourCycle: 'h23',
      calendar: 'gregory',
    })
    const parts = fmt.formatToParts(date)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  } catch {
    return null
  }
}

function parseHmToMinutes(hm: string): number | null {
  const x = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim())
  if (!x) return null
  const hh = Number(x[1])
  const mm = Number(x[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null
  return hh * 60 + mm
}

/** True if local time (policy TZ) falls within [start,end] inclusive. */
function isWithinWithdrawalWindow(policy: Record<string, unknown>, date = new Date()): boolean {
  const tz = String(policy.withdrawalWindowTimezone ?? 'Etc/UTC')
  const nowM = wallClockMinutes(date, tz)
  let s = parseHmToMinutes(String(policy.withdrawalWindowStart ?? '00:00'))
  let e = parseHmToMinutes(String(policy.withdrawalWindowEnd ?? '23:59'))
  if (nowM === null || s === null || e === null) return true
  if (s <= e) return nowM >= s && nowM <= e
  return nowM >= s || nowM <= e
}

/** Package top-up wallet split (cent-safe; parts sum to `amount`). */
function splitTopupWalletDebit(
  amount: number,
  activationPercent = 50,
  depositPercent = 50,
): { activation: number; deposit: number } {
  const cents = Math.round(amount * 100)
  if (cents <= 0) return { activation: 0, deposit: 0 }
  let actPct = Number(activationPercent)
  let depPct = Number(depositPercent)
  if (!Number.isFinite(actPct) || !Number.isFinite(depPct) || Math.abs(actPct + depPct - 100) > 0.001) {
    actPct = 50
    depPct = 50
  }
  actPct = Math.min(100, Math.max(0, actPct))
  const activationCents = Math.floor((cents * actPct) / 100)
  const depositCents = cents - activationCents
  return { activation: activationCents / 100, deposit: depositCents / 100 }
}

function packageTopupSplitFromSettings(settings: Record<string, unknown>): { activationPercent: number; depositPercent: number } {
  const activationPercent = Number(settings.packageTopupActivationPercent ?? 50)
  const depositPercent = Number(settings.packageTopupDepositPercent ?? 50)
  if (
    !Number.isFinite(activationPercent) ||
    !Number.isFinite(depositPercent) ||
    Math.abs(activationPercent + depositPercent - 100) > 0.001
  ) {
    return { activationPercent: 50, depositPercent: 50 }
  }
  return { activationPercent, depositPercent }
}

/** Non-working daily ROI cap as × principal; explicit `0` on the package = no non-working ROI. */
function resolveNonWorkingCapMultiplierFromPackage(pkg: Record<string, unknown>, siteDefault: number): number {
  if (Object.prototype.hasOwnProperty.call(pkg, 'maxRoiMultiplier') && pkg.maxRoiMultiplier != null) {
    const n = Number(pkg.maxRoiMultiplier)
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return Math.max(0, siteDefault)
}

/** Working-income (sponsor / team / rank) cap as × stake; omit field on package → site default. */
function resolveWorkingCapMultiplierFromPackage(pkg: Record<string, unknown>, siteDefault: number): number {
  if (
    Object.prototype.hasOwnProperty.call(pkg, 'workingIncomeCapMultiplier') &&
    pkg.workingIncomeCapMultiplier != null
  ) {
    const n = Number(pkg.workingIncomeCapMultiplier)
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return Math.max(0, siteDefault)
}

async function maxActivePrincipalForUser(uid: string): Promise<number> {
  const snap = await db.collection(COL_ACTIVE).where('userId', '==', uid).where('status', '==', 'active').get()
  let mx = 0
  for (const d of snap.docs) {
    mx = Math.max(mx, Number(d.data()?.amount ?? 0))
  }
  return mx
}

/** Sponsor / team / rank drip pay only when the earner has ≥1 active stake (any plan type). */
async function hasAtLeastOneActivePackage(uid: string): Promise<boolean> {
  const u = String(uid ?? '').trim()
  if (!u) return false
  const snap = await db.collection(COL_ACTIVE).where('userId', '==', u).where('status', '==', 'active').limit(1).get()
  return !snap.empty
}

function workingIncomeCreditedTotal(ud: Record<string, unknown> | undefined): number {
  if (!ud) return 0
  const totals = ud.userTotals as Record<string, unknown> | undefined
  const explicit = Number(totals?.totalWorkingIncome ?? NaN)
  if (Number.isFinite(explicit) && explicit >= 0) return explicit
  return (
    Number(ud.sponsorBonusTotal ?? 0) +
    Number(ud.teamLevelCommissionTotal ?? 0) +
    Number(ud.rankCommissionTotal ?? 0)
  )
}

/** Σ (principal × frozen working mult) across this member’s active packages. */
async function computeUserWorkingIncomeCeiling(uid: string): Promise<number> {
  const snap = await db.collection(COL_ACTIVE).where('userId', '==', uid).where('status', '==', 'active').get()
  let sum = 0
  for (const d of snap.docs) {
    const x = d.data()
    const amt = Number(x.amount ?? 0)
    const ps = x.planSnapshot as Record<string, unknown> | undefined
    const mult = Number(
      x.frozenWorkingCapMultiplier ??
        (ps != null && ps.workingIncomeCapMultiplier != null ? Number(ps.workingIncomeCapMultiplier) : undefined) ??
        3,
    )
    sum += amt * Math.max(0, mult)
  }
  return sum
}

async function userWorkingIncomeRemaining(uid: string): Promise<number> {
  const us = await db.collection(COL_USERS).doc(uid).get()
  const ceiling = await computeUserWorkingIncomeCeiling(uid)
  const credited = workingIncomeCreditedTotal(us.data() as Record<string, unknown> | undefined)
  return Math.max(0, ceiling - credited)
}

/** Skip ROI for this package when snapshot says stop-all and user has no working-income room left. */
async function shouldSkipRoiForPackageOwner(userId: string, planSnap: Record<string, unknown> | null): Promise<boolean> {
  if (!planSnap || planSnap.stopAllIncomeWhenWorkingCapReached !== true) return false
  const rem = await userWorkingIncomeRemaining(userId)
  return rem <= 1e-9
}

/** Block rank drip when user exhausted working cap and at least one active package has stop-all snapshot. */
async function shouldBlockRankPayoutForWorkingCap(uid: string): Promise<boolean> {
  const rem = await userWorkingIncomeRemaining(uid)
  if (rem > 1e-9) return false
  const snap = await db.collection(COL_ACTIVE).where('userId', '==', uid).where('status', '==', 'active').get()
  for (const d of snap.docs) {
    const ps = d.data()?.planSnapshot as Record<string, unknown> | undefined
    if (ps && ps.stopAllIncomeWhenWorkingCapReached === true) return true
  }
  return false
}

function computeMaxWithdrawalForPrincipal(
  principal: number,
  policy: Record<string, unknown>,
): number {
  if (principal <= 0) return 0
  const caps = Array.isArray(policy.withdrawPackageCaps)
    ? (policy.withdrawPackageCaps as Record<string, unknown>[])
    : []
  const usable = caps.filter((row) => row && row.active !== false)
  const exact = usable.find((row) => Number(row.packageAmount ?? -999) === principal)
  if (exact != null) {
    if (exact.usePercentFormula === true) return (principal * Number(exact.percentOfPackage ?? 20)) / 100
    return Math.max(0, Number(exact.maxWithdrawal ?? 0))
  }
  const fallbackPct = Number(policy.defaultWithdrawalPercentOfPackage ?? 20)
  return (principal * fallbackPct) / 100
}

function isWithdrawalAmountStepValid(amount: number, step: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  const s = Math.max(1, Math.floor(Number(step) || 10))
  const cents = Math.round(amount * 100)
  return cents > 0 && cents % (s * 100) === 0
}

async function lastNonRejectedWithdrawalCreatedMs(userId: string): Promise<number | null> {
  const snap = await db
    .collection(COL_WITHDRAWALS)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(25)
    .get()
  for (const doc of snap.docs) {
    const st = String(doc.data().status ?? '')
    if (st === 'rejected') continue
    const created = doc.data().createdAt as { toMillis?: () => number } | number | undefined
    if (created && typeof created === 'object' && typeof created.toMillis === 'function') {
      return created.toMillis()
    }
    if (typeof created === 'number' && Number.isFinite(created)) return created
  }
  return null
}

type FrozenTeamRow = {
  level: number
  percent: number
  requiredDirects: number
  conditionDescription?: string
  /**
   * 0–100: upline earns this level’s % only for the first `floor(planDurationDays × value / 100)` whole days
   * after the downline package `startedAt` (same clock as daily ROI). 100 = full plan length.
   * If omitted on a snapshot row, `DEFAULT_UPLINE_DURATION_CAP_PERCENT` applies (see compensationDefaults).
   */
  uplineDurationCapPercent?: number
}

type FrozenRankRow = {
  id: string
  name: string
  requiredTeamBusiness: number
  dailyReward: number
  rewardDurationDays: number
  totalReward: number
  sortOrder: number
}

function normalizePowerRestPercent(pRaw: number, rRaw: number): { p: number; r: number } {
  let p = Math.max(0, Number(pRaw))
  let r = Math.max(0, Number(rRaw))
  const s = p + r
  if (!Number.isFinite(s) || s <= 0) return { p: 50, r: 50 }
  return { p: (p / s) * 100, r: (r / s) * 100 }
}

function teamLevelDocTimeMs(x: Record<string, unknown>): number {
  const u = x.updatedAt
  if (u != null && typeof (u as { toMillis?: () => number }).toMillis === 'function') {
    return (u as { toMillis: () => number }).toMillis()
  }
  if (typeof u === 'number' && Number.isFinite(u)) return u
  const c = x.createdAt
  if (c != null && typeof (c as { toMillis?: () => number }).toMillis === 'function') {
    return (c as { toMillis: () => number }).toMillis()
  }
  if (typeof c === 'number' && Number.isFinite(c)) return c
  return 0
}

/** Reference seed doc ids (`seed_lvl_N`) — used only to break ties when two active rows share the same level. */
function isSeedTeamLevelDocId(id: string): boolean {
  return /^seed_lvl_\d+$/i.test(id)
}

type TeamLevelPick = { id: string; ts: number; data: Record<string, unknown> }

function betterTeamLevelDoc(a: TeamLevelPick, b: TeamLevelPick): TeamLevelPick {
  if (b.ts > a.ts) return b
  if (b.ts < a.ts) return a
  if (isSeedTeamLevelDocId(a.id) && !isSeedTeamLevelDocId(b.id)) return b
  if (!isSeedTeamLevelDocId(a.id) && isSeedTeamLevelDocId(b.id)) return a
  return b.id >= a.id ? b : a
}

function frozenRowFromTeamLevelData(lvl: number, x: Record<string, unknown>): FrozenTeamRow {
  const desc = x.conditionDescription != null ? String(x.conditionDescription).trim() : ''
  const rawCap = Number(x.uplineDurationCapPercent ?? DEFAULT_UPLINE_DURATION_CAP_PERCENT)
  const uplineDurationCapPercent = Math.max(
    0,
    Math.min(100, Number.isFinite(rawCap) ? rawCap : DEFAULT_UPLINE_DURATION_CAP_PERCENT),
  )
  return {
    level: lvl,
    percent: Number(x.percent ?? 0),
    requiredDirects: Number(x.requiredDirects ?? x.directs ?? 0),
    uplineDurationCapPercent,
    ...(desc ? { conditionDescription: desc } : {}),
  }
}

/**
 * Snapshot team matrix at activation. If multiple **active** rows share the same `level` (duplicate
 * configs), pick the one with the latest `updatedAt`/`createdAt` so admin edits win over stale rows.
 */
async function freezeTeamLevelsForActivation(maxLevels: number): Promise<FrozenTeamRow[]> {
  const cap = Math.min(100, Math.max(1, maxLevels))
  const snap = await db.collection(COL_TEAM_LEVELS).where('active', '==', true).get()
  const winners = new Map<number, TeamLevelPick>()
  for (const d of snap.docs) {
    const x = d.data() as Record<string, unknown>
    const lvl = Number(x.level ?? 0)
    if (!Number.isFinite(lvl) || lvl < 1) continue
    const ts = teamLevelDocTimeMs(x)
    const cand: TeamLevelPick = { id: d.id, ts, data: x }
    const cur = winners.get(lvl)
    if (!cur) {
      winners.set(lvl, cand)
      continue
    }
    winners.set(lvl, betterTeamLevelDoc(cur, cand))
  }
  const byLevel = new Map<number, FrozenTeamRow>()
  for (const [lvl, pick] of winners) {
    byLevel.set(lvl, frozenRowFromTeamLevelData(lvl, pick.data))
  }
  return Array.from({ length: cap }, (_, i) => {
    const L = i + 1
    return (
      byLevel.get(L) ?? {
        level: L,
        percent: 0,
        requiredDirects: 0,
        conditionDescription: '',
        uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
      }
    )
  })
}

async function freezeRankRowsForActivation(): Promise<FrozenRankRow[]> {
  const snap = await db.collection(COL_RANKS).where('active', '==', true).get()
  const rows: FrozenRankRow[] = snap.docs.map((d) => {
    const x = d.data()
    const daily = Number(x.dailyReward ?? 0)
    const dur = Number(x.rewardDurationDays ?? x.durationDays ?? 0)
    const storedTotal = Number(x.totalReward ?? 0)
    const totalReward = storedTotal > 0 ? storedTotal : daily * dur
    return {
      id: d.id,
      name: String(x.name ?? ''),
      requiredTeamBusiness: Number(x.requiredTeamBusiness ?? x.teamBiz ?? 0),
      dailyReward: daily,
      rewardDurationDays: dur,
      totalReward,
      sortOrder: Number(x.sortOrder ?? x.requiredTeamBusiness ?? 0),
    }
  })
  rows.sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.requiredTeamBusiness - b.requiredTeamBusiness))
  return rows
}

/** Credits TB + power/rest volume to every uplines for rank qualification (50/50 split of incoming BV by default). */
async function propagateTeamBusinessVolume(
  beneficiaryUid: string,
  amount: number,
  powerPct: number,
  restPct: number,
) {
  if (amount <= 0) return
  const { p, r } = normalizePowerRestPercent(powerPct, restPct)
  const pFrac = p / 100
  const rFrac = r / 100
  let cur = beneficiaryUid
  for (;;) {
    const cs = await db.collection(COL_USERS).doc(cur).get()
    if (!cs.exists) break
    const sponsor = cs.data()?.sponsorUid as string | undefined
    if (!sponsor) break
    await db.collection(COL_USERS).doc(sponsor).set(
      {
        totalTeamBusiness: FieldValue.increment(amount),
        powerTeamBusiness: FieldValue.increment(amount * pFrac),
        restTeamBusiness: FieldValue.increment(amount * rFrac),
        updatedAt: Date.now(),
      },
      { merge: true },
    )
    cur = sponsor
  }
}

/**
 * One-time direct sponsor bonus when a referred user activates.
 * Credited against the sponsor’s global working-income ceiling (Σ stake × 3).
 * Team level income is paid daily from downline ROI — see `distributeTeamLevelIncomeFromDailyRoi`.
 */
async function paySponsorBonusForActivation(
  activePackageId: string,
  beneficiaryUid: string,
  activationAmount: number,
  planSnap: Record<string, unknown>,
) {
  const sponsorPct = Number(planSnap.sponsorPercent ?? 5)
  const bene = await db.collection(COL_USERS).doc(beneficiaryUid).get()
  const sponsorUid = bene.exists ? (bene.data()?.sponsorUid as string | undefined) : undefined
  let sponsorPaid = 0

  if (!sponsorUid || !(await hasAtLeastOneActivePackage(sponsorUid))) {
    await db
      .collection(COL_ACTIVE)
      .doc(activePackageId)
      .set({ workingPaid: 0, sponsorPaidAtActivation: 0, updatedAt: Date.now() }, { merge: true })
    return
  }

  const sRef = db.collection(COL_USERS).doc(sponsorUid)
  const sSnap = await sRef.get()
  if (!sSnap.exists || Boolean(sSnap.data()?.blocked)) {
    await db
      .collection(COL_ACTIVE)
      .doc(activePackageId)
      .set({ workingPaid: 0, sponsorPaidAtActivation: 0, updatedAt: Date.now() }, { merge: true })
    return
  }

  const gross = (activationAmount * sponsorPct) / 100
  const remaining = await userWorkingIncomeRemaining(sponsorUid)
  const payAmt = Math.min(gross, Math.max(0, remaining))
  if (payAmt > 1e-12) {
    await sRef.update({
      'wallets.cash': FieldValue.increment(payAmt),
      workingIncomeBalance: FieldValue.increment(payAmt),
      sponsorBonusTotal: FieldValue.increment(payAmt),
      'userTotals.totalWorkingIncome': FieldValue.increment(payAmt),
      updatedAt: Date.now(),
    })
    await db.collection('sponsorBonuses').add({
      userId: sponsorUid,
      fromUserId: beneficiaryUid,
      amount: payAmt,
      activePackageId,
      createdAt: FieldValue.serverTimestamp(),
    })
    sponsorPaid = payAmt
  }

  await db
    .collection(COL_ACTIVE)
    .doc(activePackageId)
    .set(
      {
        workingPaid: sponsorPaid,
        workingIncomeEarned: sponsorPaid,
        sponsorPaidAtActivation: sponsorPaid,
        updatedAt: Date.now(),
      },
      { merge: true },
    )
}

/** Whole calendar days from package start (used with daily ROI cadence). */
function wholeDaysSincePackageStart(startedAt: Timestamp, now: Timestamp): number {
  return Math.max(0, Math.floor((now.toMillis() - startedAt.toMillis()) / 86400000))
}

/** Cap % and max paying calendar days for this matrix row (null max = no day cap when plan duration unset). */
function teamLevelWindowCapMaxPayDays(
  row: FrozenTeamRow,
  planDurationDays: number,
): { capPct: number; maxPayDays: number | null } {
  const dur = Math.max(0, Math.floor(planDurationDays))
  const rawCap =
    row.uplineDurationCapPercent != null
      ? Number(row.uplineDurationCapPercent)
      : DEFAULT_UPLINE_DURATION_CAP_PERCENT
  const capPct = Math.max(
    0,
    Math.min(100, Number.isFinite(rawCap) ? rawCap : DEFAULT_UPLINE_DURATION_CAP_PERCENT),
  )
  if (dur <= 0) return { capPct, maxPayDays: null }
  const maxPayDays = Math.floor((dur * capPct) / 100)
  if (maxPayDays <= 0) return { capPct, maxPayDays: 0 }
  return { capPct, maxPayDays }
}

/**
 * When downline plan has a positive duration, upline earns this row only while
 * `elapsedDays < floor(durationDays × capPercent / 100)`. Missing cap on old snapshots uses
 * `DEFAULT_UPLINE_DURATION_CAP_PERCENT`.
 */
function teamLevelPayoutWithinDownlinePlanWindow(
  row: FrozenTeamRow,
  startedAt: Timestamp,
  now: Timestamp,
  planDurationDays: number,
): boolean {
  const { maxPayDays } = teamLevelWindowCapMaxPayDays(row, planDurationDays)
  if (maxPayDays === null) return true
  if (maxPayDays <= 0) return false
  const elapsed = wholeDaysSincePackageStart(startedAt, now)
  return elapsed < maxPayDays
}

function teamMatrixHasPayablePercent(rows: FrozenTeamRow[]): boolean {
  return rows.some((r) => r && Number(r.percent) > 0)
}

/**
 * Team matrix for a downline package: frozen `planSnapshot.teamLevels` first, then the member’s
 * `rankCompensationSnapshot.teamLevels` (latest activation capture).
 */
async function resolveTeamFrozenForPackagePayout(
  downlineUid: string,
  planSnap: Record<string, unknown>,
): Promise<FrozenTeamRow[]> {
  const fromPkg = Array.isArray(planSnap.teamLevels) ? (planSnap.teamLevels as FrozenTeamRow[]) : []
  if (teamMatrixHasPayablePercent(fromPkg)) return fromPkg

  const uSnap = await db.collection(COL_USERS).doc(downlineUid).get()
  if (!uSnap.exists) return fromPkg
  const rankSnap = uSnap.data()?.rankCompensationSnapshot as Record<string, unknown> | undefined
  const fromUser = Array.isArray(rankSnap?.teamLevels) ? (rankSnap.teamLevels as FrozenTeamRow[]) : []
  if (teamMatrixHasPayablePercent(fromUser)) return fromUser
  return fromPkg.length > 0 ? fromPkg : fromUser
}

/** Build plan snapshot for ROI/team when legacy `activePackages` rows omit `planSnapshot`. */
function effectivePlanSnapshotForActivePackage(
  ap: Record<string, unknown>,
  userData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const existing = ap.planSnapshot
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>) }
  }
  const rankSnap = userData?.rankCompensationSnapshot as Record<string, unknown> | undefined
  const wMult = Number(
    ap.frozenWorkingCapMultiplier ??
      (rankSnap?.workingIncomeCapMultiplier as number | undefined) ??
      3,
  )
  const nwMult = Number(
    ap.frozenNonWorkingCapMultiplier ??
      (rankSnap?.nonWorkingIncomeCapMultiplier as number | undefined) ??
      2,
  )
  const amount = Number(ap.amount ?? 0)
  return {
    roiPercent: Number(ap.roiPercent ?? 0),
    durationDays: Number(ap.durationDays ?? 0),
    planType: String(ap.planType ?? 'daily'),
    teamLevels: Array.isArray(rankSnap?.teamLevels) ? rankSnap!.teamLevels : [],
    nonWorkingIncomeCapMultiplier: nwMult,
    workingIncomeCapMultiplier: wMult,
    workingCap: amount * Math.max(wMult, 0),
    stopAllIncomeWhenWorkingCapReached: rankSnap?.stopAllIncomeWhenWorkingCapReached === true,
  }
}

/** Split of downline daily ROI to uplines — % × credited ROI; each pay min(gross, sponsor’s working room left). */
async function distributeTeamLevelIncomeFromDailyRoi(
  downlineActivePackageId: string,
  downlineUid: string,
  dailyRoiCredited: number,
  planSnap: Record<string, unknown>,
  payoutClock: { startedAt: Timestamp; now: Timestamp; durationDays: number },
) {
  if (dailyRoiCredited <= 1e-12) return

  const teamFrozen = await resolveTeamFrozenForPackagePayout(downlineUid, planSnap)
  if (!teamMatrixHasPayablePercent(teamFrozen)) return
  const activeCache = new Map<string, boolean>()
  const uplHasActive = async (uid: string) => {
    const k = String(uid ?? '').trim()
    if (!k) return false
    if (activeCache.has(k)) return activeCache.get(k)!
    const ok = await hasAtLeastOneActivePackage(k)
    activeCache.set(k, ok)
    return ok
  }

  let child = downlineUid
  for (let depth = 0; depth < teamFrozen.length; depth++) {
    const row = teamFrozen[depth]
    const childSnap = await db.collection(COL_USERS).doc(child).get()
    if (!childSnap.exists) break
    const upl = childSnap.data()?.sponsorUid as string | undefined
    if (!upl) break

    if (row && row.percent > 0) {
      if (!teamLevelPayoutWithinDownlinePlanWindow(row, payoutClock.startedAt, payoutClock.now, payoutClock.durationDays)) {
        child = upl
        continue
      }
      const uplRef = db.collection(COL_USERS).doc(upl)
      const uplSnap = await uplRef.get()
      if (uplSnap.exists && !Boolean(uplSnap.data()?.blocked) && (await uplHasActive(upl))) {
        const directs = Number(uplSnap.data()?.activeDirects ?? 0)
        if (directs >= row.requiredDirects) {
          const gross = (dailyRoiCredited * row.percent) / 100
          const remaining = await userWorkingIncomeRemaining(upl)
          const payAmt = Math.min(gross, Math.max(0, remaining))
          if (payAmt > 1e-12) {
            const { capPct, maxPayDays } = teamLevelWindowCapMaxPayDays(row, payoutClock.durationDays)
            const durSnap = Math.max(0, Math.floor(payoutClock.durationDays))
            await uplRef.update({
              'wallets.cash': FieldValue.increment(payAmt),
              workingIncomeBalance: FieldValue.increment(payAmt),
              teamLevelCommissionTotal: FieldValue.increment(payAmt),
              'userTotals.totalWorkingIncome': FieldValue.increment(payAmt),
              updatedAt: Date.now(),
            })
            await db
              .collection(COL_ACTIVE)
              .doc(downlineActivePackageId)
              .set(
                {
                  workingPaid: FieldValue.increment(payAmt),
                  workingIncomeEarned: FieldValue.increment(payAmt),
                  updatedAt: Date.now(),
                },
                { merge: true },
              )
            await db.collection('teamLevelBonuses').add({
              userId: upl,
              fromUserId: downlineUid,
              level: row.level,
              amount: payAmt,
              activePackageId: downlineActivePackageId,
              downlinePackageAmount: Number(planSnap.packageAmount ?? planSnap.activationAmount ?? 0),
              sourceDailyRoi: dailyRoiCredited,
              distribution: 'daily_roi_share',
              /** Upline clients cannot read downline `activePackages`; denorm for dashboard “remaining days”. */
              downlinePackageStartedAt: payoutClock.startedAt,
              teamLevelWindowDurationDays: durSnap,
              teamLevelWindowCapPercent: capPct,
              teamLevelWindowMaxPayDays: maxPayDays,
              ...(row.conditionDescription ? { conditionDescription: row.conditionDescription } : {}),
              createdAt: FieldValue.serverTimestamp(),
            })
          }
        }
      }
    }
    child = upl
  }
}

function rankMilestoneQualifies(
  u: Record<string, unknown>,
  rank: FrozenRankRow,
  powerPct: number,
  restPct: number,
): boolean {
  const req = rank.requiredTeamBusiness
  const tb = Number(u.totalTeamBusiness ?? 0)
  const pb = Number(u.powerTeamBusiness ?? 0)
  const rb = Number(u.restTeamBusiness ?? 0)
  if (tb < req) return false
  if (pb + rb < 1e-9 && tb > 0) return tb >= req
  const { p, r } = normalizePowerRestPercent(powerPct, restPct)
  return pb >= (req * p) / 100 && rb >= (req * r) / 100
}

function pickNextSequentialRank(
  u: Record<string, unknown>,
  ranks: FrozenRankRow[],
  completed: Set<string>,
  powerPct: number,
  restPct: number,
): FrozenRankRow | null {
  for (const rank of ranks) {
    if (completed.has(rank.id)) continue
    return rankMilestoneQualifies(u, rank, powerPct, restPct) ? rank : null
  }
  return null
}

async function resolveRankPolicyForUser(uid: string, u: Record<string, unknown>) {
  void uid
  const snap = u.rankCompensationSnapshot as Record<string, unknown> | undefined
  const arr = snap?.ranks
  if (Array.isArray(arr) && arr.length > 0) {
    const ranks = (arr as Record<string, unknown>[])
      .map((x) => ({
        id: String(x.id ?? ''),
        name: String(x.name ?? ''),
        requiredTeamBusiness: Number(x.requiredTeamBusiness ?? 0),
        dailyReward: Number(x.dailyReward ?? 0),
        rewardDurationDays: Number(x.rewardDurationDays ?? x.durationDays ?? 0),
        totalReward: Number(x.totalReward ?? 0),
        sortOrder: Number(x.sortOrder ?? x.requiredTeamBusiness ?? 0),
      }))
      .filter((row) => row.id.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.requiredTeamBusiness - b.requiredTeamBusiness)
    const { p, r } = normalizePowerRestPercent(
      Number(snap?.rankQualificationPowerPercent ?? 50),
      Number(snap?.rankQualificationRestPercent ?? 50),
    )
    return ranks.length ? { ranks, p, r } : null
  }
  const live = await freezeRankRowsForActivation()
  if (live.length === 0) return null
  const st = (await db.collection(COL_SETTINGS).doc('config').get()).data() ?? {}
  const { p, r } = normalizePowerRestPercent(
    Number(st.rankQualificationPowerPercent ?? 50),
    Number(st.rankQualificationRestPercent ?? 50),
  )
  return { ranks: live, p, r }
}

async function finalizeRankSchedule(uid: string, rankId: string) {
  await db
    .collection(COL_USERS)
    .doc(uid)
    .set(
      {
        rankRewardActive: false,
        rankRewardDaysPaid: 0,
        rankRewardTotalDays: 0,
        rankRewardDailyAmount: 0,
        rankRewardRankId: '',
        rankRewardRankName: '',
        rankRewardLastPaidDayKey: '',
        completedRankRewardIds: FieldValue.arrayUnion(rankId),
        updatedAt: Date.now(),
      },
      { merge: true },
    )
}

async function tryStartNextRankSchedule(uid: string) {
  const ref = db.collection(COL_USERS).doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return
  const u = snap.data() as Record<string, unknown>
  if (u.rankRewardActive === true) return

  const policy = await resolveRankPolicyForUser(uid, u)
  if (!policy) return

  const rawDone = u.completedRankRewardIds
  const done = new Set<string>(Array.isArray(rawDone) ? (rawDone as string[]).map(String) : [])
  const next = pickNextSequentialRank(u, policy.ranks, done, policy.p, policy.r)
  if (!next || next.dailyReward <= 0 || next.rewardDurationDays <= 0) return

  await ref.set(
    {
      rankRewardActive: true,
      rankRewardDaysPaid: 0,
      rankRewardTotalDays: next.rewardDurationDays,
      rankRewardDailyAmount: next.dailyReward,
      rankRewardRankId: next.id,
      rankRewardRankName: next.name,
      rankRewardLastPaidDayKey: '',
      currentRank: next.name,
      updatedAt: Date.now(),
    },
    { merge: true },
  )
}

/** Team-level qualification: sponsor needs N directs that each maintain ≥1 active package. Bump when beneficiary had zero actives → first active after this txn. */
async function bumpSponsorActiveDirectWhenDirectGainsFirstActivePackage(memberUid: string) {
  const bene = await db.collection(COL_USERS).doc(memberUid).get()
  const sponsor = bene.data()?.sponsorUid as string | undefined
  if (!sponsor) return
  await db
    .collection(COL_USERS)
    .doc(sponsor)
    .set({ activeDirects: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true })
}

/** When a member drops to zero active packages, decrement sponsor once (non-negative). */
async function maybeDecrementSponsorActiveDirectsWhenNoActivePackages(memberUid: string) {
  const remain = await db
    .collection(COL_ACTIVE)
    .where('userId', '==', memberUid)
    .where('status', '==', 'active')
    .limit(1)
    .get()
  if (!remain.empty) return
  const bene = await db.collection(COL_USERS).doc(memberUid).get()
  const sponsor = bene.data()?.sponsorUid as string | undefined
  if (!sponsor) return
  await db.runTransaction(async (tx) => {
    const sRef = db.collection(COL_USERS).doc(sponsor)
    const sSnap = await tx.get(sRef)
    const cur = Number(sSnap.data()?.activeDirects ?? 0)
    if (cur <= 0) return
    tx.update(sRef, { activeDirects: cur - 1, updatedAt: Date.now() })
  })
}

async function bumpRankEligibilityAlongUpline(beneficiaryUid: string, maxHops = 500) {
  let cur = beneficiaryUid
  for (let i = 0; i < maxHops; i++) {
    const cs = await db.collection(COL_USERS).doc(cur).get()
    if (!cs.exists) break
    const sponsor = cs.data()?.sponsorUid as string | undefined
    if (!sponsor) break
    await tryStartNextRankSchedule(sponsor)
    cur = sponsor
  }
}

async function processRankRewardForUser(uid: string, dayKey: string) {
  const ref = db.collection(COL_USERS).doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return
  const u = snap.data() as Record<string, unknown>

  if (u.rankRewardActive === true) {
    const lastKey = String(u.rankRewardLastPaidDayKey ?? '')
    if (lastKey === dayKey) return

    if (!(await hasAtLeastOneActivePackage(uid))) {
      return
    }

    if (Boolean(u.blocked)) {
      return
    }

    if (await shouldBlockRankPayoutForWorkingCap(uid)) {
      return
    }

    const daysPaid = Number(u.rankRewardDaysPaid ?? 0)
    const totalDays = Number(u.rankRewardTotalDays ?? 0)
    const rankId = String(u.rankRewardRankId ?? '')
    const daily = Number(u.rankRewardDailyAmount ?? 0)
    const rankName = String(u.rankRewardRankName ?? 'Rank')

    if (totalDays <= 0 || daily <= 0 || !rankId) {
      await ref.set({ rankRewardActive: false, updatedAt: Date.now() }, { merge: true })
      await tryStartNextRankSchedule(uid)
      return
    }

    if (daysPaid >= totalDays) {
      await finalizeRankSchedule(uid, rankId)
      await tryStartNextRankSchedule(uid)
      return
    }

    const workingRem = await userWorkingIncomeRemaining(uid)
    const payAmt = Math.min(daily, Math.max(0, workingRem))
    if (payAmt <= 1e-12) {
      return
    }

    const nextDay = daysPaid + 1
    const bonusId = `${uid}_${dayKey}_${rankId}_d${nextDay}`
    const existed = await db.collection('rankBonuses').doc(bonusId).get()
    if (existed.exists) return

    await db.collection('rankBonuses').doc(bonusId).set({
      userId: uid,
      rankId,
      rankName,
      amount: payAmt,
      dayKey,
      payoutSequenceDay: nextDay,
      payoutDaysTotal: totalDays,
      scheduledPayout: true,
      transactionType: 'Ranking Bonus',
      createdAt: FieldValue.serverTimestamp(),
    })

    await ref.update({
      'wallets.cash': FieldValue.increment(payAmt),
      rankCommissionTotal: FieldValue.increment(payAmt),
      workingIncomeBalance: FieldValue.increment(payAmt),
      'userTotals.totalWorkingIncome': FieldValue.increment(payAmt),
      rankRewardDaysPaid: nextDay,
      rankRewardLastPaidDayKey: dayKey,
      updatedAt: Date.now(),
    })

    if (nextDay >= totalDays) {
      await finalizeRankSchedule(uid, rankId)
      await tryStartNextRankSchedule(uid)
    }
    return
  }

  await tryStartNextRankSchedule(uid)
}

function audit(actorUid: string, action: string, detail: Record<string, unknown>) {
  return db.collection('auditLogs').add({
    actorUid,
    action,
    detail,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function assertFirestoreAdmin(actorUid: string) {
  const snap = await db.collection(COL_USERS).doc(actorUid).get()
  if (!snap.exists || String(snap.data()?.role ?? '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrator only')
  }
}

/** Revoke refresh tokens and bump Firestore session version so other browsers log out immediately. */
async function invalidateAllLoginSessions(uid: string): Promise<number> {
  await admin.auth().revokeRefreshTokens(uid)
  const uRef = db.collection(COL_USERS).doc(uid)
  await uRef.set(
    {
      authSessionVersion: FieldValue.increment(1),
      updatedAt: Date.now(),
    },
    { merge: true },
  )
  const snap = await uRef.get()
  return Number(snap.data()?.authSessionVersion ?? 1)
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

export const registerWithProfile = onCall(callableRuntimeOpts, async (request) => {
  const data = request.data as {
    email?: string
    password?: string
    fullName?: string
    phone?: string
    sponsorUsername?: string | null
    termsAccepted?: boolean
  }

  if (!data.termsAccepted) {
    throw new HttpsError('invalid-argument', 'Terms must be accepted')
  }
  const email = String(data.email || '')
    .trim()
    .toLowerCase()
  const password = String(data.password || '')
  const fullName = String(data.fullName || '').trim()
  const phone = String(data.phone || '').trim().replace(/\s+/g, '')
  const sponsorUsername = data.sponsorUsername ? String(data.sponsorUsername).trim() : null

  if (!email || !password || password.length < 8 || !fullName || phone.length < 8) {
    throw new HttpsError('invalid-argument', 'Invalid registration payload')
  }

  let sponsorUid: string | null = null
  if (sponsorUsername) {
    const sRef = db.collection(COL_USERS_BY_UN).doc(sponsorUsername)
    const sSnap = await sRef.get()
    if (!sSnap.exists) {
      throw new HttpsError('not-found', 'Sponsor ID does not exist')
    }
    sponsorUid = String(sSnap.data()?.uid || '')
  }

  const phoneRef = db.collection(COL_PHONE).doc(phone)
  const phoneSnap = await phoneRef.get()
  if (phoneSnap.exists) {
    throw new HttpsError('already-exists', 'Phone already registered')
  }

  const counterRef = db.collection(COL_COUNTERS).doc('usernames')

  const username = await db.runTransaction(async (tx) => {
    const cSnap = await tx.get(counterRef)
    const current = cSnap.exists ? Number(cSnap.data()?.current ?? USERNAME_START - 1) : USERNAME_START - 1
    const next = current + 1
    tx.set(counterRef, { current: next }, { merge: true })
    return String(next)
  })

  let userRecord: admin.auth.UserRecord
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    })
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : ''
    if (code.includes('email-already-exists')) {
      throw new HttpsError('already-exists', 'Email already in use')
    }
    throw new HttpsError('internal', 'Could not create auth user')
  }

  const now = Date.now()
  const userDoc = {
    username,
    email,
    fullName,
    phone,
    sponsorUsername,
    sponsorUid,
    role: 'user',
    wallets: { deposit: 0, activation: 0, cash: 0 },
    totalWithdrawn: 0,
    activeDirects: 0,
    currentRank: '—',
    totalTeamBusiness: 0,
    powerTeamBusiness: 0,
    restTeamBusiness: 0,
    rankRewardActive: false,
    rankRewardDaysPaid: 0,
    rankRewardTotalDays: 0,
    rankRewardDailyAmount: 0,
    rankRewardRankId: '',
    rankRewardRankName: '',
    rankRewardLastPaidDayKey: '',
    completedRankRewardIds: [],
    nonWorkingIncomeBalance: 0,
    workingIncomeBalance: 0,
    sponsorBonusTotal: 0,
    dailyProfitsTotal: 0,
    teamLevelCommissionTotal: 0,
    rankCommissionTotal: 0,
    userTotals: { totalWorkingIncome: 0 },
    createdAt: now,
    updatedAt: now,
  }

  const batch = db.batch()
  batch.set(db.collection(COL_USERS).doc(userRecord.uid), userDoc)
  batch.set(db.collection(COL_USERS_BY_UN).doc(username), { uid: userRecord.uid, authEmail: email })
  batch.set(phoneRef, { uid: userRecord.uid })
  await batch.commit()

  /** `activeDirects` is maintained when a direct activates their first package / loses last active package. */

  return { username, uid: userRecord.uid }
})

function hashTransactionPin(uid: string, pin: string) {
  return createHash('sha256').update(`${uid}:${pin}`, 'utf8').digest('hex')
}

/** Authenticated members update display fields + USDT address; optional transaction PIN (stored hashed only). */
export const updateMemberProfile = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    fullName?: string
    phone?: string
    city?: string
    usdtBep20Address?: string
    transactionPassword?: string
  }

  const fullName = String(data.fullName || '').trim()
  const phone = String(data.phone || '').trim().replace(/\s+/g, '')
  const city = String(data.city || '').trim()
  const usdtBep20Address = String(data.usdtBep20Address || '').trim()
  const transactionPasswordRaw =
    data.transactionPassword !== undefined && data.transactionPassword !== null
      ? String(data.transactionPassword)
      : ''

  if (fullName.length < 2) throw new HttpsError('invalid-argument', 'Enter your full name')
  if (phone.length < 8) throw new HttpsError('invalid-argument', 'Enter a valid mobile number')

  if (usdtBep20Address.length > 0 && !/^0x[a-fA-F0-9]{40}$/.test(usdtBep20Address)) {
    throw new HttpsError('invalid-argument', 'USDT address must be a valid 0x… BEP20 address')
  }

  if (transactionPasswordRaw.length > 0 && transactionPasswordRaw.length < 4) {
    throw new HttpsError('invalid-argument', 'Transaction password must be at least 4 characters')
  }

  const uRef = db.collection(COL_USERS).doc(uid)

  let phoneChanged = false

  await db.runTransaction(async (tx) => {
    const uSnap = await tx.get(uRef)
    if (!uSnap.exists) throw new HttpsError('not-found', 'Profile not found')

    const oldPhone = String(uSnap.data()?.phone ?? '').trim()
    phoneChanged = oldPhone !== phone

    let oldPhoneSnap: DocumentSnapshot | null = null
    if (phoneChanged) {
      const newPhoneRef = db.collection(COL_PHONE).doc(phone)
      const newPhoneSnap = await tx.get(newPhoneRef)
      if (newPhoneSnap.exists && String(newPhoneSnap.data()?.uid ?? '') !== uid) {
        throw new HttpsError('already-exists', 'That mobile number is already registered')
      }
      if (oldPhone.length > 0) {
        oldPhoneSnap = await tx.get(db.collection(COL_PHONE).doc(oldPhone))
      }
    }

    const patch: Record<string, unknown> = {
      fullName,
      phone,
      city,
      usdtBep20Address,
      updatedAt: Date.now(),
    }

    if (transactionPasswordRaw.length > 0) {
      patch.transactionPinHash = hashTransactionPin(uid, transactionPasswordRaw)
    }

    tx.update(uRef, patch)

    if (phoneChanged) {
      tx.set(db.collection(COL_PHONE).doc(phone), { uid })
      if (oldPhone.length > 0 && oldPhoneSnap?.exists && String(oldPhoneSnap.data()?.uid ?? '') === uid) {
        tx.delete(db.collection(COL_PHONE).doc(oldPhone))
      }
    }
  })

  await admin.auth().updateUser(uid, { displayName: fullName })
  await audit(uid, 'updateMemberProfile', { phoneChanged })
  return { ok: true }
})

/** Set or update the transaction PIN (hashed). Requires current PIN when one is already set. */
export const changeTransactionPassword = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    currentPassword?: string
    newPassword?: string
  }
  const currentRaw =
    data.currentPassword !== undefined && data.currentPassword !== null
      ? String(data.currentPassword)
      : ''
  const newRaw =
    data.newPassword !== undefined && data.newPassword !== null ? String(data.newPassword) : ''

  if (newRaw.length < 4) {
    throw new HttpsError('invalid-argument', 'New transaction password must be at least 4 characters')
  }

  const uRef = db.collection(COL_USERS).doc(uid)
  const uSnap = await uRef.get()
  if (!uSnap.exists) throw new HttpsError('not-found', 'Profile not found')
  const pinHash = uSnap.data()?.transactionPinHash as string | undefined

  if (pinHash) {
    if (!currentRaw.trim()) {
      throw new HttpsError('failed-precondition', 'Enter your current transaction password')
    }
    if (hashTransactionPin(uid, currentRaw) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid current transaction password')
    }
  }

  await uRef.update({
    transactionPinHash: hashTransactionPin(uid, newRaw),
    updatedAt: Date.now(),
  })
  await audit(uid, 'changeTransactionPassword', {})
  return { ok: true }
})

/** Users who list this account as sponsor (`sponsorUid`). */
export const listDirectReferrals = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const sponsorUid = request.auth.uid

  const snap = await db.collection(COL_USERS).where('sponsorUid', '==', sponsorUid).get()
  const referrals: {
    username: string
    fullName: string
    phone: string
    createdAt: number
    amount: number
    volume: number
  }[] = []

  for (const doc of snap.docs) {
    const d = doc.data()
    const childUid = doc.id

    const apSnap = await db.collection(COL_ACTIVE).where('userId', '==', childUid).get()
    let amount = 0
    apSnap.forEach((ap) => {
      if (String(ap.data()?.status ?? '') === 'active') {
        amount += Number(ap.data()?.amount ?? 0)
      }
    })

    referrals.push({
      username: String(d.username ?? ''),
      fullName: String(d.fullName ?? ''),
      phone: String(d.phone ?? ''),
      createdAt: Number(d.createdAt ?? 0),
      amount,
      volume: Number(d.totalTeamBusiness ?? 0),
    })
  }

  referrals.sort((a, b) => b.createdAt - a.createdAt)
  return { referrals }
})

/** Full downline tree under the caller (all depths). Level 1 = direct. Batched `in` queries (max 30). */
export const listAllDownlines = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const rootUid = request.auth.uid

  const depthMap = new Map<string, number>()
  depthMap.set(rootUid, 0)
  let frontier = [rootUid]

  while (frontier.length > 0) {
    const nextFrontier: string[] = []
    for (const part of chunkArray(frontier, 30)) {
      const snap = await db.collection(COL_USERS).where('sponsorUid', 'in', part).get()
      for (const doc of snap.docs) {
        const id = doc.id
        if (depthMap.has(id)) continue
        const sponsor = String(doc.data()?.sponsorUid ?? '')
        const lvl = (depthMap.get(sponsor) ?? 0) + 1
        depthMap.set(id, lvl)
        nextFrontier.push(id)
      }
    }
    frontier = nextFrontier
  }

  const memberUids = [...depthMap.keys()].filter((id) => id !== rootUid)
  if (memberUids.length === 0) {
    return { downlines: [] }
  }

  const packageSum = new Map<string, number>()
  for (const uid of memberUids) packageSum.set(uid, 0)
  for (const part of chunkArray(memberUids, 30)) {
    const apSnap = await db.collection(COL_ACTIVE).where('userId', 'in', part).get()
    apSnap.forEach((ap) => {
      if (String(ap.data()?.status ?? '') !== 'active') return
      const u = String(ap.data()?.userId ?? '')
      const amt = Number(ap.data()?.amount ?? 0)
      packageSum.set(u, (packageSum.get(u) ?? 0) + amt)
    })
  }

  const userData = new Map<string, Record<string, unknown>>()
  for (const part of chunkArray(memberUids, 100)) {
    const snaps = await Promise.all(part.map((id) => db.collection(COL_USERS).doc(id).get()))
    snaps.forEach((s) => {
      if (s.exists) userData.set(s.id, s.data() as Record<string, unknown>)
    })
  }

  const downlines: {
    username: string
    fullName: string
    createdAt: number
    sponsorUsername: string
    packageAmount: number
    level: number
  }[] = []

  for (const id of memberUids) {
    const d = userData.get(id)
    if (!d) continue
    downlines.push({
      username: String(d.username ?? ''),
      fullName: String(d.fullName ?? ''),
      createdAt: Number(d.createdAt ?? 0),
      sponsorUsername: d.sponsorUsername != null ? String(d.sponsorUsername) : '—',
      packageAmount: packageSum.get(id) ?? 0,
      level: depthMap.get(id) ?? 1,
    })
  }

  downlines.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return a.username.localeCompare(b.username)
  })

  await audit(rootUid, 'listAllDownlines', { count: downlines.length })
  return { downlines }
})

/** Ki-style topup: resolve username → display name for form hint */
export const resolveUsername = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const raw = String((request.data as { username?: string })?.username ?? '').trim().toLowerCase()
  if (!raw) return { fullName: '' }
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(raw).get()
  if (!mapSnap.exists) return { fullName: 'Invalid Id' }
  const bid = mapSnap.data()!.uid as string
  const uSnap = await db.collection(COL_USERS).doc(bid).get()
  if (!uSnap.exists) return { fullName: 'Invalid Id' }
  const fn = String(uSnap.data()!.fullName ?? '').trim()
  return { fullName: fn || '—' }
})

/** Registration / invite links: resolve referral username → public display name (no sign-in required). */
export const publicResolveReferrer = onCall(callableRuntimeOpts, async (request) => {
  const raw = String((request.data as { username?: string })?.username ?? '').trim()
  if (!raw || raw.length > 96) {
    throw new HttpsError('invalid-argument', 'Invalid referral ID')
  }
  const key = raw.toLowerCase()
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get()
  if (!mapSnap.exists) return { found: false, fullName: '' }
  const bid = mapSnap.data()!.uid as string
  const uSnap = await db.collection(COL_USERS).doc(bid).get()
  if (!uSnap.exists) return { found: false, fullName: '' }
  const fn = String(uSnap.data()!.fullName ?? '').trim()
  return { found: true, fullName: fn || '—' }
})

const LOGIN_SYNTHETIC_EMAIL_DOMAIN = 'richpay.local'

function isValidEmailForReset(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function resolveAuthEmailForUsername(username: string, mapData: Record<string, unknown> | undefined): string {
  const alt = mapData?.authEmail
  if (typeof alt === 'string') {
    const e = alt.trim().toLowerCase()
    if (isValidEmailForReset(e)) return e
  }
  return `${username.trim().toLowerCase()}@${LOGIN_SYNTHETIC_EMAIL_DOMAIN}`
}

/** Firebase Identity Toolkit — sends the same template email as client `sendPasswordResetEmail`. */
async function sendPasswordResetOob(
  apiKey: string,
  signInEmail: string,
  continueUrl?: string,
): Promise<void> {
  const key = apiKey.trim()
  if (key.length < 10) {
    throw new Error('Invalid or missing Firebase Web API key.')
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`
  const body: Record<string, string> = {
    requestType: 'PASSWORD_RESET',
    email: signInEmail,
  }
  const cu = continueUrl?.trim()
  if (cu) body.continueUrl = cu
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await r.json()) as { error?: { message?: string } }
  if (!r.ok) {
    const msg = j.error?.message ?? r.statusText
    throw new Error(String(msg))
  }
}

/** Identity Toolkit — apply OOB reset and return Firebase Auth uid (`localId`). */
async function completePasswordResetOob(
  apiKey: string,
  oobCode: string,
  newPassword: string,
): Promise<{ uid: string; email: string }> {
  const key = apiKey.trim()
  if (key.length < 10) {
    throw new Error('Invalid or missing Firebase Web API key.')
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${encodeURIComponent(key)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode, newPassword }),
  })
  const j = (await r.json()) as { localId?: string; email?: string; error?: { message?: string } }
  if (!r.ok) {
    const msg = j.error?.message ?? r.statusText
    throw new Error(String(msg))
  }
  const uid = String(j.localId ?? '').trim()
  if (!uid) throw new Error('Password reset did not return a user id.')
  return { uid, email: String(j.email ?? '') }
}

/**
 * Public: complete forgot-password flow from `/reset-password` and sign out other sessions.
 */
export const completePasswordReset = onCall(callableRuntimeOpts, async (request) => {
  const data = request.data as { oobCode?: string; newPassword?: string; firebaseWebApiKey?: string }
  const oobCode = String(data.oobCode ?? '').trim()
  let newPassword = String(data.newPassword ?? '')
  const webApiKey =
    process.env.FIREBASE_WEB_API_KEY?.trim() || String(data.firebaseWebApiKey ?? '').trim()

  if (!oobCode) throw new HttpsError('invalid-argument', 'Reset link is invalid or expired.')
  if (newPassword.length < 6) {
    newPassword = newPassword.padEnd(6, '0')
  }
  if (newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.')
  }

  let uid = ''
  try {
    const res = await completePasswordResetOob(webApiKey, oobCode, newPassword)
    uid = res.uid
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('EXPIRED_OOB_CODE') || msg.includes('INVALID_OOB_CODE')) {
      throw new HttpsError('failed-precondition', 'This reset link is invalid or has expired.')
    }
    throw new HttpsError('internal', 'Could not reset password. Try again or request a new link.')
  }

  const authSessionVersion = await invalidateAllLoginSessions(uid)
  void audit(uid, 'completePasswordReset', {}).catch(() => {})
  return { ok: true, authSessionVersion }
})

/**
 * Public: user supplies numeric UserID + registered email. If they match Firestore / Auth mapping,
 * Firebase sends a password reset link to the **Auth sign-in email** (real email or synthetic @richpay.local).
 */
export const requestPasswordReset = onCall(callableRuntimeOpts, async (request) => {
  const data = request.data as { username?: string; email?: string; firebaseWebApiKey?: string }
  const username = String(data.username ?? '').trim().toLowerCase()
  const emailInput = String(data.email ?? '').trim().toLowerCase()
  const webApiKey =
    process.env.FIREBASE_WEB_API_KEY?.trim() || String(data.firebaseWebApiKey ?? '').trim()

  if (!/^\d{4,12}$/.test(username)) {
    return { sent: false, message: 'Enter your numeric UserID (for example 9994549).' }
  }
  if (!isValidEmailForReset(emailInput)) {
    return { sent: false, message: 'Enter the email address registered on your account.' }
  }

  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(username).get()
  if (!mapSnap.exists) {
    return { sent: false, message: 'UserID and email do not match our records.' }
  }
  const mapData = mapSnap.data() as Record<string, unknown> | undefined
  const uid = String(mapData?.uid ?? '')
  if (!uid) {
    return { sent: false, message: 'UserID and email do not match our records.' }
  }

  const userSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!userSnap.exists) {
    return { sent: false, message: 'UserID and email do not match our records.' }
  }
  const uData = userSnap.data() as Record<string, unknown> | undefined
  const profileEmail = String(uData?.email ?? '').trim().toLowerCase()
  const mapAuthEmail =
    typeof mapData?.authEmail === 'string' ? String(mapData.authEmail).trim().toLowerCase() : ''
  const signInEmail = resolveAuthEmailForUsername(username, mapData)

  const emailOk =
    emailInput === profileEmail ||
    (mapAuthEmail.length > 0 && emailInput === mapAuthEmail) ||
    emailInput === signInEmail.toLowerCase()

  if (!emailOk) {
    return { sent: false, message: 'UserID and email do not match our records.' }
  }

  try {
    await admin.auth().getUser(uid)
  } catch {
    return { sent: false, message: 'Could not send a reset email for this account. Contact support.' }
  }

  const continueUrl =
    process.env.PASSWORD_RESET_CONTINUE_URL?.trim() || 'https://richpay.live/reset-password'

  try {
    await sendPasswordResetOob(webApiKey, signInEmail, continueUrl)
  } catch (e) {
    console.warn('[requestPasswordReset] sendOobCode failed', e)
    const detail = e instanceof Error ? e.message : String(e)
    return {
      sent: false,
      message:
        webApiKey.length < 10
          ? 'Password reset is not configured. Set VITE_FIREBASE_API_KEY in the app build, or set FIREBASE_WEB_API_KEY on Cloud Functions.'
          : `Could not send the reset email (${detail}). Try again or contact support.`,
    }
  }

  void audit(uid, 'requestPasswordReset', { username }).catch(() => {})

  return {
    sent: true,
    message: 'Password reset email sent. Check your inbox (and spam). Follow the link to choose a new password.',
  }
})

/**
 * After the member changes their login password (dashboard or reset page), revoke other sessions.
 * The device that just changed the password should call this and update local session version.
 */
export const finalizeLoginPasswordChange = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const authSessionVersion = await invalidateAllLoginSessions(uid)
  void audit(uid, 'finalizeLoginPasswordChange', {}).catch(() => {})
  return { authSessionVersion }
})

/** Admin-only: set a member's Firebase Auth login password and sign them out everywhere else. */
export const adminResetMemberLoginPassword = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { userId?: string; newPassword?: string }
  const userId = String(data.userId ?? '').trim()
  let newPassword = String(data.newPassword ?? '')

  if (!userId) throw new HttpsError('invalid-argument', 'userId is required')
  if (newPassword.length < 6) {
    newPassword = newPassword.padEnd(6, '0')
  }
  if (newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters')
  }

  const uSnap = await db.collection(COL_USERS).doc(userId).get()
  if (!uSnap.exists) throw new HttpsError('not-found', 'User not found')

  try {
    await admin.auth().updateUser(userId, { password: newPassword })
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : ''
    if (code.includes('invalid-password')) {
      throw new HttpsError('invalid-argument', 'Password does not meet Firebase requirements')
    }
    throw new HttpsError('internal', 'Could not update login password')
  }

  const authSessionVersion = await invalidateAllLoginSessions(userId)
  void audit(actorUid, 'adminResetMemberLoginPassword', { userId }).catch(() => {})
  return { ok: true, authSessionVersion }
})

export const activatePackage = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    packageId?: string
    amount?: number
    beneficiaryUsername?: string
    transactionPassword?: string
    planType?: number
  }
  const { packageId, amount, beneficiaryUsername, transactionPassword, planType } = data
  if (!packageId || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Invalid package selection')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const callerUsername = String(caller.username ?? '').trim().toLowerCase()

  const pinHash = caller.transactionPinHash as string | undefined
  const pinRaw = transactionPassword !== undefined && transactionPassword !== null ? String(transactionPassword) : ''
  if (pinHash) {
    if (pinRaw.length === 0) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, pinRaw) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  const beneRaw = String(beneficiaryUsername ?? '').trim().toLowerCase()
  let beneficiaryUid = uid
  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const settings = settingsSnap.data() ?? {}
  const restrictTopupToDirects = enforcePackageTopupDirectReferralOnly(settings as Record<string, unknown>)

  if (beneRaw && beneRaw !== callerUsername) {
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(beneRaw).get()
    if (!mapSnap.exists) throw new HttpsError('not-found', 'Invalid UserID to Topup')
    beneficiaryUid = mapSnap.data()!.uid as string
    const beneSnap = await db.collection(COL_USERS).doc(beneficiaryUid).get()
    if (!beneSnap.exists) throw new HttpsError('not-found', 'Member not found')
    if (restrictTopupToDirects) {
      const sponsorOfBene = beneSnap.data()?.sponsorUid as string | undefined
      if (sponsorOfBene !== uid) {
        throw new HttpsError(
          'permission-denied',
          'You can only topup your direct referrals or yourself (or enable “Activation transfers: allow any member UserID” in Transfer settings to allow any UserID).',
        )
      }
    }
  }

  const pkgSnap = await db.collection(COL_PACKAGES).doc(packageId).get()
  if (!pkgSnap.exists) throw new HttpsError('not-found', 'Package not found')
  const pkg = pkgSnap.data()!
  if (!pkg.active) throw new HttpsError('failed-precondition', 'Package inactive')
  const minAmount = Number(pkg.minAmount ?? 0)
  const maxAmount = Number(pkg.maxAmount ?? 0)
  if (amount < minAmount || amount > maxAmount) {
    throw new HttpsError('invalid-argument', 'Amount out of range')
  }

  const splitPercents = packageTopupSplitFromSettings(settings as Record<string, unknown>)
  const splitDebit = splitTopupWalletDebit(amount, splitPercents.activationPercent, splitPercents.depositPercent)
  const callerWallets = caller.wallets as { activation?: number; deposit?: number } | undefined
  const depositBal = Number(callerWallets?.deposit ?? 0)
  const activationBalPre = Number(callerWallets?.activation ?? 0)
  if (activationBalPre < splitDebit.activation || depositBal < splitDebit.deposit) {
    throw new HttpsError(
      'failed-precondition',
      `Package purchase splits ${splitPercents.activationPercent}/${splitPercents.depositPercent}: need $${splitDebit.activation.toFixed(2)} in Activation Wallet and $${splitDebit.deposit.toFixed(2)} in Deposit Wallet (total $${amount.toFixed(2)})`,
    )
  }

  const teamDepth = Math.min(100, Math.max(1, Number(settings.teamLevelsCount ?? 30)))
  const sponsorPctFrozen = Number(settings.sponsorPercent ?? 5)
  const siteNwMult = Number(settings.nonWorkingIncomeCapMultiplier ?? 2)
  const siteWMult = Number(settings.workingIncomeCapMultiplier ?? 3)
  const frozenNonWorkingCapMultiplier = resolveNonWorkingCapMultiplierFromPackage(pkg, siteNwMult)
  const frozenWorkingCapMultiplier = resolveWorkingCapMultiplierFromPackage(pkg, siteWMult)
  const totalIncomeMult = frozenNonWorkingCapMultiplier + frozenWorkingCapMultiplier
  const stopAllIncomeFrozen = settings.stopAllIncomeWhenWorkingCapReached === true
  const minWithdrawFrozen = Number(settings.minWithdrawal ?? 10)
  const withdrawFeeFrozen = Number(settings.withdrawFeePercent ?? 10)
  const planSettingsVersion = Number(settings.planSettingsVersion ?? 0)
  const rkPowerIn = Number(settings.rankQualificationPowerPercent ?? 50)
  const rkRestIn = Number(settings.rankQualificationRestPercent ?? 50)
  const { p: rkPowerPct, r: rkRestPct } = normalizePowerRestPercent(rkPowerIn, rkRestIn)

  const roiPercent = Number(pkg.roiPercent ?? 0)
  const durationDays = Number(pkg.durationDays ?? 0)
  const planWantCompound = planType === 2
  const pkgShelfRaw = String(pkg.packageShelf ?? 'investment').toLowerCase()
  const pkgShelf = pkgShelfRaw === 'compounding' ? 'compounding' : 'investment'
  if (planWantCompound && pkgShelf !== 'compounding') {
    throw new HttpsError(
      'invalid-argument',
      'Choose a Rich Compounding tier (Package Management → Compounding) when using Compounding plan type.',
    )
  }
  if (!planWantCompound && pkgShelf === 'compounding') {
    throw new HttpsError(
      'invalid-argument',
      'This tier is Rich Compounding only — select Compounding plan type.',
    )
  }
  const planLabel = planWantCompound ? 'compounding' : 'daily'
  const capturedAt = Date.now()

  const withdrawFrozen = freezeWithdrawPolicyFromSettings(settings)

  const teamLevelsFrozen = await freezeTeamLevelsForActivation(teamDepth)
  const ranksFrozen = await freezeRankRowsForActivation()

  const planSnapshot: Record<string, unknown> = {
    schemaVersion: 2,
    capturedAtMillis: capturedAt,
    planSettingsVersionAtCapture: planSettingsVersion,
    packageId,
    packageName: String(pkg.name ?? ''),
    activationAmount: amount,
    packageAmount: amount,
    roiPercent,
    durationDays,
    planType: planLabel,
    nonWorkingMultiplier: frozenNonWorkingCapMultiplier,
    nonWorkingIncomeCapMultiplier: frozenNonWorkingCapMultiplier,
    workingMultiplier: frozenWorkingCapMultiplier,
    workingIncomeCapMultiplier: frozenWorkingCapMultiplier,
    nonWorkingCap: amount * Math.max(frozenNonWorkingCapMultiplier, 0),
    workingCap: amount * Math.max(frozenWorkingCapMultiplier, 0),
    /** Combined ceiling multiple (non-working + working) vs principal — informational at activation. */
    totalIncomeCapMultiplier: totalIncomeMult,
    totalReturnMultiplier: totalIncomeMult,
    totalReturnPercent: totalIncomeMult * 100,
    sponsorPercent: sponsorPctFrozen,
    minWithdrawal: minWithdrawFrozen,
    withdrawFeePercent: withdrawFeeFrozen,
    rankQualificationPowerPercent: rkPowerPct,
    rankQualificationRestPercent: rkRestPct,
    teamLevels: teamLevelsFrozen,
    ranks: ranksFrozen,
    withdrawalPolicySnapshot: withdrawFrozen,
    roiAccrualMode: planLabel === 'compounding' ? 'compound_balance' : 'flat_principal',
    stopAllIncomeWhenWorkingCapReached: stopAllIncomeFrozen,
  }

  const apRef = db.collection(COL_ACTIVE).doc()

  const preActiveForBene = await db
    .collection(COL_ACTIVE)
    .where('userId', '==', beneficiaryUid)
    .where('status', '==', 'active')
    .limit(1)
    .get()
  const beneHadNoActivePackage = preActiveForBene.empty

  await db.runTransaction(async (tx) => {
    const uRef = db.collection(COL_USERS).doc(uid)
    const uSnap = await tx.get(uRef)
    if (!uSnap.exists) throw new HttpsError('not-found', 'User missing')
    const wallets = uSnap.data()?.wallets as { activation: number; deposit?: number } | undefined
    const act = Number(wallets?.activation ?? 0)
    const depW = Number(wallets?.deposit ?? 0)
    if (act < splitDebit.activation || depW < splitDebit.deposit) {
      throw new HttpsError(
        'failed-precondition',
        'Insufficient activation or deposit wallet for configured package split',
      )
    }

    tx.update(uRef, {
      'wallets.activation': act - splitDebit.activation,
      'wallets.deposit': depW - splitDebit.deposit,
      updatedAt: Date.now(),
    })

    const now = Timestamp.now()
    const ends = Timestamp.fromMillis(now.toMillis() + durationDays * 86400000)
    tx.set(apRef, {
      userId: beneficiaryUid,
      packageId,
      amount,
      roiPercent,
      durationDays,
      startedAt: now,
      endsAt: ends,
      nonWorkingPaid: 0,
      workingPaid: 0,
      workingIncomeEarned: 0,
      status: 'active',
      planType: planLabel,
      purchasedByUid: uid,
      frozenNonWorkingCapMultiplier,
      frozenWorkingCapMultiplier,
      planSnapshot,
      ...(planLabel === 'compounding' ? { compoundingBalance: amount } : {}),
    })
  })

  await paySponsorBonusForActivation(apRef.id, beneficiaryUid, amount, planSnapshot)

  await propagateTeamBusinessVolume(beneficiaryUid, amount, rkPowerPct, rkRestPct)

  await db
    .collection(COL_USERS)
    .doc(beneficiaryUid)
    .set(
      {
        rankCompensationSnapshot: {
          teamLevels: teamLevelsFrozen,
          ranks: ranksFrozen,
          rankQualificationPowerPercent: rkPowerPct,
          rankQualificationRestPercent: rkRestPct,
          planSettingsVersionAtCapture: planSettingsVersion,
          capturedAtMillis: capturedAt,
        },
        withdrawalPolicySnapshot: withdrawFrozen,
        updatedAt: Date.now(),
      },
      { merge: true },
    )

  if (beneHadNoActivePackage) {
    await bumpSponsorActiveDirectWhenDirectGainsFirstActivePackage(beneficiaryUid)
  }
  await bumpRankEligibilityAlongUpline(beneficiaryUid)

  await audit(uid, 'activatePackage', {
    packageId,
    amount,
    beneficiaryUid,
    planType: planLabel,
    planSettingsVersionAtCapture: planSettingsVersion,
    activePackageId: apRef.id,
  })
  return { activePackageId: apRef.id }
})

export const createWithdrawal = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    amount?: number
    address?: string
    transactionPassword?: string
  }
  const amount = Number(data.amount)
  const address = data.address != null ? String(data.address).trim() : ''
  const transactionPassword =
    data.transactionPassword !== undefined && data.transactionPassword !== null
      ? String(data.transactionPassword)
      : ''

  if (!amount || amount <= 0 || !address || address.length < 10) {
    throw new HttpsError('invalid-argument', 'Invalid withdrawal')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const pinHash = caller.transactionPinHash as string | undefined
  if (pinHash) {
    if (!transactionPassword.trim()) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const liveSettings = settingsSnap.data() ?? {}
  const livePol = freezeWithdrawPolicyFromSettings(liveSettings)
  const frozen = caller.withdrawalPolicySnapshot as Record<string, unknown> | undefined
  const policy: Record<string, unknown> = mergeWithdrawPolicyForUser(livePol, frozen)

  if (policy.withdrawalsEnabled === false) {
    throw new HttpsError('failed-precondition', 'Withdrawals are temporarily disabled')
  }

  if (!isWithdrawalDayAllowed(policy)) {
    throw new HttpsError(
      'failed-precondition',
      'Withdrawals are not allowed today — check allowed days in the withdrawal schedule.',
    )
  }

  if (!isWithinWithdrawalWindow(policy)) {
    throw new HttpsError(
      'failed-precondition',
      'Withdrawals are only allowed during the published time window.',
    )
  }

  const minW = Number(policy.minWithdrawal ?? 10)
  const feePct = Number(policy.withdrawFeePercent ?? 10)
  if (amount < minW) {
    throw new HttpsError('invalid-argument', `Minimum withdrawal ${minW}`)
  }

  const amountStep = Math.max(1, Math.floor(Number(policy.withdrawalAmountStep ?? 10)))
  if (!isWithdrawalAmountStepValid(amount, amountStep)) {
    throw new HttpsError(
      'invalid-argument',
      `Withdrawal amount must be a multiple of ${amountStep} USDT (e.g. ${amountStep}, ${amountStep * 2}, ${amountStep * 3}).`,
    )
  }

  const cooldownH = Math.max(0, Number(policy.withdrawalCooldownHours ?? 78))
  if (cooldownH > 0) {
    const lastMs = await lastNonRejectedWithdrawalCreatedMs(uid)
    if (lastMs != null) {
      const elapsed = Date.now() - lastMs
      const windowMs = cooldownH * 3600000
      if (elapsed < windowMs) {
        const nextAt = new Date(lastMs + windowMs).toISOString()
        const waitH = Math.ceil((windowMs - elapsed) / 3600000)
        throw new HttpsError(
          'failed-precondition',
          `You can submit the next withdrawal in about ${waitH} hour(s) (after ${nextAt}).`,
        )
      }
    }
  }

  const maxPrincipal = await maxActivePrincipalForUser(uid)
  if (policy.withdrawalRequiresActivePackage !== false) {
    if (maxPrincipal <= 0) {
      throw new HttpsError('failed-precondition', 'An active package is required to withdraw.')
    }
    const cap = computeMaxWithdrawalForPrincipal(maxPrincipal, policy)
    if (amount > cap + 1e-6) {
      throw new HttpsError(
        'invalid-argument',
        `Amount exceeds the maximum allowed for your active package (${cap.toFixed(2)} USDT).`,
      )
    }
  }

  const fee = (amount * feePct) / 100
  const net = amount - fee

  const wRef = db.collection(COL_WITHDRAWALS).doc()
  await db.runTransaction(async (tx) => {
    const uRef = db.collection(COL_USERS).doc(uid)
    const uSnap = await tx.get(uRef)
    const cash = Number(uSnap.data()?.wallets?.cash ?? 0)
    if (cash < amount) throw new HttpsError('failed-precondition', 'Insufficient cash')

    tx.update(uRef, {
      'wallets.cash': cash - amount,
      totalWithdrawn: FieldValue.increment(amount),
      updatedAt: Date.now(),
    })
    tx.set(wRef, {
      userId: uid,
      amountGross: amount,
      fee,
      amountNet: net,
      address,
      status: 'pending',
      policySnapshot: policy,
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  await audit(uid, 'createWithdrawal', { amount, address })
  return { withdrawalId: wRef.id }
})

export const walletConvert = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const { from, to, amount } = request.data as {
    from?: 'deposit' | 'activation' | 'cash'
    to?: 'deposit' | 'activation' | 'cash'
    amount?: number
  }
  if (!from || !to || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Invalid conversion')
  }
  const allowed =
    (from === 'deposit' && to === 'activation') || (from === 'activation' && to === 'cash')
  if (!allowed) {
    throw new HttpsError('failed-precondition', 'Conversion path not permitted')
  }

  if (from === 'deposit' && to === 'activation') {
    const cfgSnap = await db.collection(COL_SETTINGS).doc('config').get()
    if (cfgSnap.exists && cfgSnap.data()?.depositToActivationConvertEnabled === false) {
      throw new HttpsError('failed-precondition', 'Deposit → Activation conversion is disabled')
    }
  }

  await db.runTransaction(async (tx) => {
    const uRef = db.collection(COL_USERS).doc(uid)
    const uSnap = await tx.get(uRef)
    const wallets = uSnap.data()?.wallets as Record<string, number>
    const a = Number(wallets?.[from] ?? 0)
    if (a < amount) throw new HttpsError('failed-precondition', 'Insufficient balance')
    tx.update(uRef, {
      [`wallets.${from}`]: a - amount,
      [`wallets.${to}`]: Number(wallets?.[to] ?? 0) + amount,
      updatedAt: Date.now(),
    })
  })

  await audit(uid, 'walletConvert', { from, to, amount })
})

/**
 * Move USDT from caller’s cash (income) wallet to a member’s activation wallet — Ki “Convert” form.
 * Beneficiary must be the caller or a direct referral. Requires transaction PIN when set on profile.
 */
export const convertIncomeToActivation = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    beneficiaryUsername?: string
    amount?: number
    transactionPassword?: string
  }
  const amount = Number(data.amount)
  const beneRaw = String(data.beneficiaryUsername ?? '').trim().toLowerCase()
  const transactionPassword = data.transactionPassword !== undefined ? String(data.transactionPassword) : ''

  if (!beneRaw || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter UserID and a valid amount')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const callerUsername = String(caller.username ?? '').trim().toLowerCase()

  const pinHash = caller.transactionPinHash as string | undefined
  if (pinHash) {
    if (!transactionPassword.trim()) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(beneRaw).get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Invalid UserID')
  const beneficiaryUid = mapSnap.data()!.uid as string

  if (beneRaw !== callerUsername) {
    const beneSnap = await db.collection(COL_USERS).doc(beneficiaryUid).get()
    if (!beneSnap.exists) throw new HttpsError('not-found', 'Member not found')
    const sponsorOfBene = beneSnap.data()?.sponsorUid as string | undefined
    if (sponsorOfBene !== uid) {
      throw new HttpsError('permission-denied', 'You can only convert for yourself or your direct referrals')
    }
  }

  await db.runTransaction(async (tx) => {
    const callerRef = db.collection(COL_USERS).doc(uid)
    const beneRef = db.collection(COL_USERS).doc(beneficiaryUid)

    const cSnap = await tx.get(callerRef)
    const bSnap = await tx.get(beneRef)
    if (!cSnap.exists || !bSnap.exists) throw new HttpsError('not-found', 'User missing')

    const cash = Number(cSnap.data()?.wallets?.cash ?? 0)
    if (cash < amount) throw new HttpsError('failed-precondition', 'Insufficient income (cash) balance')

    const cWallets = cSnap.data()?.wallets as Record<string, number> | undefined
    const bWallets = bSnap.data()?.wallets as Record<string, number> | undefined

    if (beneficiaryUid === uid) {
      tx.update(callerRef, {
        'wallets.cash': cash - amount,
        'wallets.activation': Number(cWallets?.activation ?? 0) + amount,
        updatedAt: Date.now(),
      })
    } else {
      tx.update(callerRef, {
        'wallets.cash': cash - amount,
        updatedAt: Date.now(),
      })
      tx.update(beneRef, {
        'wallets.activation': Number(bWallets?.activation ?? 0) + amount,
        updatedAt: Date.now(),
      })
    }
  })

  await audit(uid, 'convertIncomeToActivation', { amount, beneficiaryUid, beneficiaryUsername: beneRaw })
})

/**
 * Peer transfer: caller’s activation wallet → recipient’s activation wallet (Ki Transfer form).
 * Recipient must exist. Unless `siteSettings.config.allowActivationTransferToAnyUser` is true,
 * recipient must be a direct referral (sponsorUid === caller). Not self.
 */
export const internalTransfer = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const data = request.data as {
    recipientUsername?: string
    amount?: number
    transactionPassword?: string
  }
  const amount = Number(data.amount)
  const recipRaw = String(data.recipientUsername ?? '').trim().toLowerCase()
  const transactionPassword = data.transactionPassword !== undefined ? String(data.transactionPassword) : ''

  if (!recipRaw || !amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter recipient UserID and amount')
  }

  const callerSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!callerSnap.exists) throw new HttpsError('not-found', 'User missing')
  const caller = callerSnap.data()!
  const callerUsername = String(caller.username ?? '').trim().toLowerCase()

  const pinHash = caller.transactionPinHash as string | undefined
  if (pinHash) {
    if (!transactionPassword.trim()) {
      throw new HttpsError('failed-precondition', 'Transaction password required')
    }
    if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
      throw new HttpsError('permission-denied', 'Invalid transaction password')
    }
  }

  if (recipRaw === callerUsername) {
    throw new HttpsError('invalid-argument', 'Choose a team member UserID to transfer to')
  }

  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(recipRaw).get()
  if (!mapSnap.exists) throw new HttpsError('not-found', 'Invalid UserID')
  const recipientUid = mapSnap.data()!.uid as string

  const beneSnap = await db.collection(COL_USERS).doc(recipientUid).get()
  if (!beneSnap.exists) throw new HttpsError('not-found', 'Member not found')

  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const transferToAnyMember = Boolean(settingsSnap.data()?.allowActivationTransferToAnyUser)
  if (!transferToAnyMember) {
    const sponsorOfRecip = beneSnap.data()?.sponsorUid as string | undefined
    if (sponsorOfRecip !== uid) {
      throw new HttpsError('permission-denied', 'You can only transfer to your direct referrals')
    }
  }

  const transferRef = db.collection(COL_INTERNAL).doc()

  await db.runTransaction(async (tx) => {
    const senderRef = db.collection(COL_USERS).doc(uid)
    const recipRef = db.collection(COL_USERS).doc(recipientUid)
    const sSnap = await tx.get(senderRef)
    const rSnap = await tx.get(recipRef)
    if (!sSnap.exists || !rSnap.exists) throw new HttpsError('not-found', 'User missing')

    const sAct = Number(sSnap.data()?.wallets?.activation ?? 0)
    if (sAct < amount) throw new HttpsError('failed-precondition', 'Insufficient activation wallet')

    const rAct = Number(rSnap.data()?.wallets?.activation ?? 0)

    tx.update(senderRef, {
      'wallets.activation': sAct - amount,
      updatedAt: Date.now(),
    })
    tx.update(recipRef, {
      'wallets.activation': rAct + amount,
      updatedAt: Date.now(),
    })

    tx.set(transferRef, {
      userId: uid,
      recipientUid,
      amount,
      fromWallet: 'activation',
      toWallet: 'activation',
      fromUsername: callerUsername,
      toUsername: recipRaw,
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  await audit(uid, 'internalTransfer', { amount, recipientUid, recipientUsername: recipRaw })
})

/**
 * Approve / reject (refund) / mark paid withdrawals. Reject only from `pending` refunds cash + totalWithdrawn.
 */
export const adminWithdrawalUpdate = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as {
    withdrawalId?: string
    next?: 'processing' | 'approved' | 'rejected' | 'paid'
    txHash?: string
  }
  const withdrawalId = String(data.withdrawalId || '').trim()
  const next = data.next
  const txHash = data.txHash != null ? String(data.txHash).trim() : ''

  if (!withdrawalId || !next) {
    throw new HttpsError('invalid-argument', 'withdrawalId and next are required')
  }

  const ref = db.collection(COL_WITHDRAWALS).doc(withdrawalId)
  const mailbox: { userId: string; title: string; body: string }[] = []

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Withdrawal not found')
    const d = snap.data()!
    const cur = String(d.status || '')
    const uid = String(d.userId)
    const gross = Number(d.amountGross ?? 0)

    if (next === 'rejected') {
      if (cur !== 'pending' && cur !== 'processing') {
        throw new HttpsError('failed-precondition', 'Only pending or processing withdrawals can be rejected')
      }
      tx.update(ref, {
        status: 'rejected',
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      tx.update(db.collection(COL_USERS).doc(uid), {
        'wallets.cash': FieldValue.increment(gross),
        totalWithdrawn: FieldValue.increment(-gross),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal rejected',
        body: `${gross} USDT was returned to your cash wallet.`,
      })
      return
    }

    if (next === 'processing') {
      if (cur === 'processing') {
        throw new HttpsError('failed-precondition', 'Withdrawal is already processing')
      }
      if (cur !== 'pending' && cur !== 'approved') {
        throw new HttpsError(
          'failed-precondition',
          'Only pending or approved withdrawals can be marked processing',
        )
      }
      tx.update(ref, {
        status: 'processing',
        processingAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal processing',
        body: 'Your withdrawal is being processed for payout.',
      })
      return
    }

    if (next === 'approved') {
      if (cur !== 'pending' && cur !== 'processing') {
        throw new HttpsError('failed-precondition', 'Only pending or processing withdrawals can be approved')
      }
      tx.update(ref, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal approved',
        body: 'Your withdrawal is approved and will be processed for payout.',
      })
      return
    }

    if (next === 'paid') {
      if (cur !== 'pending' && cur !== 'approved' && cur !== 'processing') {
        throw new HttpsError('failed-precondition', 'Withdrawal must be pending, approved, or processing')
      }
      const resolvedTx = txHash.length > 0 ? txHash : 'PENDING_CONFIRMATION'
      tx.update(ref, {
        status: 'paid',
        txId: resolvedTx,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: Date.now(),
      })
      mailbox.push({
        userId: uid,
        title: 'Withdrawal paid',
        body: `Marked paid. TX/reference: ${resolvedTx}`,
      })
      return
    }

    throw new HttpsError('invalid-argument', 'Invalid next status')
  })

  const note = mailbox[0]
  if (note) {
    await db.collection('notifications').add({
      userId: note.userId,
      title: note.title,
      body: note.body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await audit(actorUid, 'adminWithdrawalUpdate', { withdrawalId, next })
  return { ok: true }
})

/**
 * Admin approves/rejects a deposit. Approval credits `wallets.deposit` in the same transaction as the status flip
 * (fixes missed credits when only Firestore was updated from the console or an older client).
 * Idempotent: repeats do not double-credit when `walletCreditApplied` is already true.
 */
export const adminFinalizeDeposit = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { depositId?: string; decision?: string; adminNote?: string | null }
  const depositId = String(data.depositId ?? '').trim()
  const decision = String(data.decision ?? '').trim().toLowerCase()
  const rawNote = data.adminNote != null ? String(data.adminNote).trim() : ''
  const notePatch = rawNote.length > 0 ? { adminNote: rawNote } : {}

  if (!depositId) {
    throw new HttpsError('invalid-argument', 'depositId is required')
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new HttpsError('invalid-argument', 'decision must be approved or rejected')
  }

  const depRef = db.collection(COL_DEPOSITS).doc(depositId)

  if (decision === 'rejected') {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(depRef)
      if (!snap.exists) throw new HttpsError('not-found', 'Deposit not found')
      const d = snap.data()!
      const cur = String(d.status ?? '')
        .trim()
        .toLowerCase()
      if (cur !== 'pending') {
        throw new HttpsError('failed-precondition', 'Only pending deposits can be rejected')
      }
      tx.update(depRef, {
        status: 'rejected',
        reviewedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
    })
    await audit(actorUid, 'adminDepositRejected', { depositId })
    return { ok: true, credited: 0 }
  }

  let notifyUserId = ''
  const creditedAmount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(depRef)
    if (!snap.exists) throw new HttpsError('not-found', 'Deposit not found')
    const d = snap.data()!
    const cur = String(d.status ?? '')
      .trim()
      .toLowerCase()
    const alreadyCredited = d.walletCreditApplied === true

    if (alreadyCredited && cur === 'approved') {
      return 0
    }

    const amount = Number(d.amount ?? 0)
    const userId = String(d.userId ?? '').trim()
    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('failed-precondition', 'Invalid deposit amount or member id')
    }
    notifyUserId = userId

    const userRef = db.collection(COL_USERS).doc(userId)

    if (cur === 'pending' && alreadyCredited) {
      tx.update(depRef, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        walletCreditApplied: true,
        walletCreditAppliedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
      return 0
    }

    if (!alreadyCredited) {
      tx.update(userRef, {
        'wallets.deposit': FieldValue.increment(amount),
        updatedAt: Date.now(),
      })
    }

    if (cur === 'pending') {
      tx.update(depRef, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        walletCreditApplied: true,
        walletCreditAppliedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
      return alreadyCredited ? 0 : amount
    }

    if (cur === 'approved') {
      tx.update(depRef, {
        walletCreditApplied: true,
        walletCreditAppliedAt: FieldValue.serverTimestamp(),
        ...notePatch,
      })
      return alreadyCredited ? 0 : amount
    }

    throw new HttpsError(
      'failed-precondition',
      'Deposit cannot be approved — not pending nor an approved row missing wallet credit.',
    )
  })

  if (creditedAmount > 0 && notifyUserId) {
    await db.collection('notifications').add({
      userId: notifyUserId,
      title: 'Deposit approved',
      body: `${creditedAmount} USDT credited to your deposit wallet`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await audit(actorUid, 'adminFinalizeDeposit', { depositId, decision, creditedAmount })
  return { ok: true, credited: creditedAmount }
})

const WALLET_SHADOW_KEYS = ['deposit', 'activation', 'cash'] as const

/**
 * Old `set(..., { merge: true })` with dotted keys like `wallets.deposit` created stray top-level fields
 * literally named `wallets.deposit` while the nested map `wallets.deposit` stayed at 0 — the app reads
 * nested `wallets.*` only, so balances appeared empty. This merges each shadow into nested `wallets.*`
 * and deletes the shadow segment. Idempotent for already-clean docs.
 */
export const adminRepairWalletShadowFields = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const userId = String((request.data as { userId?: string })?.userId ?? '').trim()
  if (!userId) throw new HttpsError('invalid-argument', 'userId is required')

  const ref = db.collection(COL_USERS).doc(userId)
  type Up = [string | FieldPath, unknown]
  const merged: string[] = []

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'User not found')

    const pairs: Up[] = []
    for (const w of WALLET_SHADOW_KEYS) {
      const ghost = snap.get(new FieldPath(`wallets.${w}`))
      if (typeof ghost !== 'number' || !Number.isFinite(ghost) || ghost === 0) continue
      const nested = snap.get(new FieldPath('wallets', w))
      const n =
        typeof nested === 'number' && Number.isFinite(nested) ? nested : Number(nested ?? 0) || 0
      pairs.push([new FieldPath('wallets', w), n + ghost])
      pairs.push([new FieldPath(`wallets.${w}`), FieldValue.delete()])
      merged.push(w)
    }

    if (pairs.length === 0) return

    pairs.push(['updatedAt', Date.now()])
    const flat = pairs.flat() as [string | FieldPath, unknown, ...unknown[]]
    ;(tx.update as (r: typeof ref, ...args: unknown[]) => void)(ref, ...flat)
  })

  await audit(actorUid, 'adminRepairWalletShadowFields', { userId, mergedLeaves: merged })
  return { ok: true, repaired: merged.length > 0, mergedLeaves: merged }
})

/** Which user balance field to adjust (Firestore paths, nested wallets use dot notation for increment updates). */
const ADMIN_ADJUST_BALANCE_FIELDS = [
  'wallet_deposit',
  'wallet_activation',
  'wallet_cash',
  'nonWorkingIncomeBalance',
  'workingIncomeBalance',
  'userTotals_totalWorkingIncome',
  'sponsorBonusTotal',
  'dailyProfitsTotal',
  'teamLevelCommissionTotal',
  'rankCommissionTotal',
] as const

type AdminAdjustBalanceField = (typeof ADMIN_ADJUST_BALANCE_FIELDS)[number]

function adminAdjustBalanceFirestorePath(field: AdminAdjustBalanceField): string {
  switch (field) {
    case 'wallet_deposit':
      return 'wallets.deposit'
    case 'wallet_activation':
      return 'wallets.activation'
    case 'wallet_cash':
      return 'wallets.cash'
    case 'nonWorkingIncomeBalance':
      return 'nonWorkingIncomeBalance'
    case 'workingIncomeBalance':
      return 'workingIncomeBalance'
    case 'userTotals_totalWorkingIncome':
      return 'userTotals.totalWorkingIncome'
    case 'sponsorBonusTotal':
      return 'sponsorBonusTotal'
    case 'dailyProfitsTotal':
      return 'dailyProfitsTotal'
    case 'teamLevelCommissionTotal':
      return 'teamLevelCommissionTotal'
    case 'rankCommissionTotal':
      return 'rankCommissionTotal'
    default: {
      const _exhaustive: never = field
      throw new Error(`Unhandled balance field: ${String(_exhaustive)}`)
    }
  }
}

function readAdminAdjustableBalance(snap: DocumentSnapshot, field: AdminAdjustBalanceField): number {
  const d = snap.data()
  if (!d) return 0
  switch (field) {
    case 'wallet_deposit':
      return Number((d.wallets as Record<string, unknown> | undefined)?.deposit ?? 0)
    case 'wallet_activation':
      return Number((d.wallets as Record<string, unknown> | undefined)?.activation ?? 0)
    case 'wallet_cash':
      return Number((d.wallets as Record<string, unknown> | undefined)?.cash ?? 0)
    case 'nonWorkingIncomeBalance':
      return Number(d.nonWorkingIncomeBalance ?? 0)
    case 'workingIncomeBalance':
      return Number(d.workingIncomeBalance ?? 0)
    case 'userTotals_totalWorkingIncome':
      return Number((d.userTotals as Record<string, unknown> | undefined)?.totalWorkingIncome ?? 0)
    case 'sponsorBonusTotal':
      return Number(d.sponsorBonusTotal ?? 0)
    case 'dailyProfitsTotal':
      return Number(d.dailyProfitsTotal ?? 0)
    case 'teamLevelCommissionTotal':
      return Number(d.teamLevelCommissionTotal ?? 0)
    case 'rankCommissionTotal':
      return Number(d.rankCommissionTotal ?? 0)
    default: {
      const _exhaustive: never = field
      void _exhaustive
      return 0
    }
  }
}

/**
 * Admin-only: apply a signed delta to one numeric balance field on a member (`users/{userId}`).
 * Prevents resulting values below zero. Audited.
 */
export const adminAdjustMemberBalances = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { userId?: string; field?: string; delta?: number }
  const userId = String(data.userId ?? '').trim()
  const fieldRaw = String(data.field ?? '').trim()
  const delta = Number(data.delta)

  if (!userId) throw new HttpsError('invalid-argument', 'userId is required')
  if (!ADMIN_ADJUST_BALANCE_FIELDS.includes(fieldRaw as AdminAdjustBalanceField)) {
    throw new HttpsError('invalid-argument', 'Invalid balance field')
  }
  const field = fieldRaw as AdminAdjustBalanceField
  if (!Number.isFinite(delta) || delta === 0) {
    throw new HttpsError('invalid-argument', 'delta must be a non-zero finite number')
  }
  if (Math.abs(delta) > 1e12) {
    throw new HttpsError('invalid-argument', 'delta out of allowed range')
  }

  const ref = db.collection(COL_USERS).doc(userId)
  const path = adminAdjustBalanceFirestorePath(field)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'User not found')
    const cur = readAdminAdjustableBalance(snap, field)
    if (cur + delta < -1e-9) {
      throw new HttpsError('failed-precondition', 'Adjustment would make balance negative')
    }
    tx.update(ref, {
      [path]: FieldValue.increment(delta),
      updatedAt: Date.now(),
    } as Record<string, unknown>)
  })

  await audit(actorUid, 'adminAdjustMemberBalances', { userId, field, delta })
  return { ok: true }
})

const BULK_WALLET_KEYS = ['deposit', 'activation', 'cash'] as const
type BulkWalletKey = (typeof BULK_WALLET_KEYS)[number]

const BULK_WALLET_TRANSFER_CONFIRM = 'TRANSFER ALL'

function parseBulkWalletKey(raw: string): BulkWalletKey {
  const v = raw.trim().toLowerCase()
  if (BULK_WALLET_KEYS.includes(v as BulkWalletKey)) return v as BulkWalletKey
  throw new HttpsError('invalid-argument', 'Invalid wallet. Choose deposit, activation, or cash.')
}

function readUserWalletLeaf(snap: DocumentSnapshot, key: BulkWalletKey): number {
  const d = snap.data()
  if (!d) return 0
  const nest = Number((d.wallets as Record<string, unknown> | undefined)?.[key] ?? 0)
  const shadowRaw = d[`wallets.${key}`]
  const shadow =
    typeof shadowRaw === 'number' && Number.isFinite(shadowRaw) ? shadowRaw : Number(shadowRaw ?? 0) || 0
  return nest + shadow
}

async function assertMaintenanceModeForBulkTransfer() {
  const cfg = (await db.collection(COL_SETTINGS).doc('config').get()).data() ?? {}
  if (cfg.maintenanceMode !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Maintenance mode must be enabled before running a bulk wallet transfer.',
    )
  }
}

async function transferOneUserWalletBetween(
  uid: string,
  from: BulkWalletKey,
  to: BulkWalletKey,
): Promise<number> {
  const ref = db.collection(COL_USERS).doc(uid)
  let transferred = 0
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return

    const d = snap.data()!
    const wallets: Record<string, number> = {}
    for (const w of BULK_WALLET_KEYS) {
      wallets[w] = readUserWalletLeaf(snap, w)
    }

    const amount = wallets[from]
    if (!Number.isFinite(amount) || amount <= 1e-9) return

    wallets[from] = 0
    wallets[to] = wallets[to] + amount
    transferred = amount

    const patch: Record<string, unknown> = {
      wallets,
      updatedAt: Date.now(),
    }
    for (const w of BULK_WALLET_KEYS) {
      if (d[`wallets.${w}`] !== undefined) {
        patch[`wallets.${w}`] = FieldValue.delete()
      }
    }
    tx.update(ref, patch)
  })
  return transferred
}

async function scanBulkWalletTransfer(from: BulkWalletKey, execute: boolean, to: BulkWalletKey) {
  const usersSnap = await db.collection(COL_USERS).get()
  let usersWithBalance = 0
  let totalAmount = 0
  let usersProcessed = 0

  for (const docSnap of usersSnap.docs) {
    if (execute) {
      const moved = await transferOneUserWalletBetween(docSnap.id, from, to)
      usersProcessed++
      if (moved > 1e-9) {
        usersWithBalance++
        totalAmount += moved
      }
    } else {
      const amt = readUserWalletLeaf(docSnap, from)
      if (amt > 1e-9) {
        usersWithBalance++
        totalAmount += amt
      }
    }
  }

  return {
    totalUsers: usersSnap.size,
    usersWithBalance,
    totalAmount: Math.round(totalAmount * 100) / 100,
    usersProcessed: execute ? usersProcessed : usersSnap.size,
  }
}

const bulkWalletTransferRuntimeOpts = {
  ...callableRuntimeOpts,
  memory: '512MiB' as const,
  timeoutSeconds: 540,
}

/** Admin-only preview: how much would move from one wallet to another for all members. */
export const adminPreviewBulkWalletTransfer = onCall(bulkWalletTransferRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  await assertFirestoreAdmin(request.auth.uid)

  const data = request.data as { fromWallet?: string; toWallet?: string }
  const from = parseBulkWalletKey(String(data.fromWallet ?? ''))
  const to = parseBulkWalletKey(String(data.toWallet ?? ''))
  if (from === to) {
    throw new HttpsError('invalid-argument', 'Source and destination wallet must be different.')
  }

  const stats = await scanBulkWalletTransfer(from, false, to)
  const maintenanceOn = Boolean(
    ((await db.collection(COL_SETTINGS).doc('config').get()).data() ?? {}).maintenanceMode,
  )

  return { ...stats, fromWallet: from, toWallet: to, maintenanceMode: maintenanceOn }
})

/**
 * Admin-only: move every member's balance from one wallet leaf to another.
 * Requires maintenance mode and confirm phrase `TRANSFER ALL`.
 */
export const adminBulkWalletTransfer = onCall(bulkWalletTransferRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)
  await assertMaintenanceModeForBulkTransfer()

  const data = request.data as { fromWallet?: string; toWallet?: string; confirmPhrase?: string }
  const from = parseBulkWalletKey(String(data.fromWallet ?? ''))
  const to = parseBulkWalletKey(String(data.toWallet ?? ''))
  const confirmPhrase = String(data.confirmPhrase ?? '').trim()

  if (from === to) {
    throw new HttpsError('invalid-argument', 'Source and destination wallet must be different.')
  }
  if (confirmPhrase !== BULK_WALLET_TRANSFER_CONFIRM) {
    throw new HttpsError(
      'failed-precondition',
      `Type ${BULK_WALLET_TRANSFER_CONFIRM} to confirm this irreversible bulk transfer.`,
    )
  }

  const stats = await scanBulkWalletTransfer(from, true, to)
  void audit(actorUid, 'adminBulkWalletTransfer', { fromWallet: from, toWallet: to, ...stats }).catch(() => {})
  return { ok: true, fromWallet: from, toWallet: to, ...stats }
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Admin-only: update a member's login email and/or mobile (`phone` + `phoneIndex` + Firebase Auth).
 */
export const adminUpdateMemberContact = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { userId?: string; email?: string; phone?: string }
  const userId = String(data.userId ?? '').trim()
  const emailRaw = data.email !== undefined && data.email !== null ? String(data.email).trim() : undefined
  const phoneRaw = data.phone !== undefined && data.phone !== null ? String(data.phone).trim() : undefined

  if (!userId) throw new HttpsError('invalid-argument', 'userId is required')
  if (emailRaw === undefined && phoneRaw === undefined) {
    throw new HttpsError('invalid-argument', 'Provide email and/or phone to update')
  }

  const email =
    emailRaw !== undefined ? emailRaw.toLowerCase() : undefined
  const phone =
    phoneRaw !== undefined ? phoneRaw.replace(/\s+/g, '') : undefined

  if (email !== undefined) {
    if (!email || !EMAIL_RE.test(email)) {
      throw new HttpsError('invalid-argument', 'Enter a valid email address')
    }
  }
  if (phone !== undefined) {
    if (!phone || phone.length < 8) {
      throw new HttpsError('invalid-argument', 'Enter a valid mobile number (at least 8 digits)')
    }
  }

  const uRef = db.collection(COL_USERS).doc(userId)
  let emailChanged = false
  let phoneChanged = false
  let username = ''

  await db.runTransaction(async (tx) => {
    const uSnap = await tx.get(uRef)
    if (!uSnap.exists) throw new HttpsError('not-found', 'User not found')

    const cur = uSnap.data()!
    username = String(cur.username ?? '').trim()
    const oldEmail = String(cur.email ?? '').trim().toLowerCase()
    const oldPhone = String(cur.phone ?? '').trim()

    const patch: Record<string, unknown> = { updatedAt: Date.now() }

    if (email !== undefined && email !== oldEmail) {
      emailChanged = true
      patch.email = email
    }

    if (phone !== undefined && phone !== oldPhone) {
      phoneChanged = true
      patch.phone = phone
      const newPhoneRef = db.collection(COL_PHONE).doc(phone)
      const newPhoneSnap = await tx.get(newPhoneRef)
      if (newPhoneSnap.exists && String(newPhoneSnap.data()?.uid ?? '') !== userId) {
        throw new HttpsError('already-exists', 'That mobile number is already registered')
      }
      let oldPhoneSnap: DocumentSnapshot | null = null
      if (oldPhone.length > 0) {
        oldPhoneSnap = await tx.get(db.collection(COL_PHONE).doc(oldPhone))
      }
      tx.set(db.collection(COL_PHONE).doc(phone), { uid: userId })
      if (oldPhone.length > 0 && oldPhoneSnap?.exists && String(oldPhoneSnap.data()?.uid ?? '') === userId) {
        tx.delete(db.collection(COL_PHONE).doc(oldPhone))
      }
    }

    if (!emailChanged && !phoneChanged) {
      throw new HttpsError('failed-precondition', 'Email and phone are unchanged')
    }

    tx.update(uRef, patch)

    if (emailChanged && username.length > 0) {
      tx.set(
        db.collection(COL_USERS_BY_UN).doc(username),
        { authEmail: email },
        { merge: true },
      )
    }
  })

  if (emailChanged && email) {
    try {
      await admin.auth().updateUser(userId, { email })
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : ''
      if (code.includes('email-already-exists')) {
        throw new HttpsError('already-exists', 'Email already in use by another account')
      }
      throw new HttpsError('internal', 'Could not update Firebase Auth email')
    }
  }

  await audit(actorUid, 'adminUpdateMemberContact', { userId, emailChanged, phoneChanged })
  return { ok: true, emailChanged, phoneChanged }
})

/**
 * Permanently remove a member: `users/{uid}`, `usersByUsername/{username}`, matching `phoneIndex`,
 * and Firebase Auth user. Cannot delete yourself or an account that still has `role: admin`.
 */
export const adminDeleteMember = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const targetUid = String((request.data as { userId?: string })?.userId ?? '').trim()
  if (!targetUid) throw new HttpsError('invalid-argument', 'userId is required')
  if (targetUid === actorUid) {
    throw new HttpsError('permission-denied', 'You cannot delete your own administrator account')
  }

  const uRef = db.collection(COL_USERS).doc(targetUid)
  const uSnap = await uRef.get()
  if (!uSnap.exists) throw new HttpsError('not-found', 'User not found')

  const d = uSnap.data()!
  if (String(d.role ?? '') === 'admin') {
    throw new HttpsError(
      'failed-precondition',
      'Change this user’s role from Admin to Member before deleting the account',
    )
  }

  const username = String(d.username ?? '').trim()
  const phone = String(d.phone ?? '').trim().replace(/\s+/g, '')

  const batch = db.batch()
  batch.delete(uRef)

  if (username) {
    const mapRef = db.collection(COL_USERS_BY_UN).doc(username)
    const mapSnap = await mapRef.get()
    if (mapSnap.exists && String(mapSnap.data()?.uid ?? '') === targetUid) {
      batch.delete(mapRef)
    }
  }

  if (phone.length >= 8) {
    const phoneRef = db.collection(COL_PHONE).doc(phone)
    const phoneSnap = await phoneRef.get()
    if (phoneSnap.exists && String(phoneSnap.data()?.uid ?? '') === targetUid) {
      batch.delete(phoneRef)
    }
  }

  await batch.commit()

  try {
    await admin.auth().deleteUser(targetUid)
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : ''
    if (!code.includes('user-not-found')) {
      throw new HttpsError('internal', 'Firestore data removed but Firebase Auth delete failed — check Auth console')
    }
  }

  await audit(actorUid, 'adminDeleteMember', { deletedUid: targetUid, username, phone: phone || undefined })
  return { ok: true }
})

type ReferralCampaignTierRow = {
  id: string
  sortOrder: number
  rewardLabel: string
  rewardSubtitle?: string
  minMemberPackageAmount?: number
  requiredDirectReferrals: number
  requireMemberActivePackage?: boolean
  requireDirectActivePackage?: boolean
  directMustRegisterInCampaignWindow?: boolean
}

function mapReferralCampaignDoc(id: string, data: Record<string, unknown>) {
  const tiersRaw = Array.isArray(data.tiers) ? data.tiers : []
  const tiers: ReferralCampaignTierRow[] = tiersRaw
    .map((t, i) => {
      const row = t as Record<string, unknown>
      return {
        id: String(row.id ?? `tier-${i + 1}`),
        sortOrder: Number(row.sortOrder ?? (i + 1) * 10),
        rewardLabel: String(row.rewardLabel ?? ''),
        rewardSubtitle: row.rewardSubtitle != null ? String(row.rewardSubtitle) : undefined,
        minMemberPackageAmount:
          row.minMemberPackageAmount != null ? Number(row.minMemberPackageAmount) : undefined,
        requiredDirectReferrals: Math.max(1, Number(row.requiredDirectReferrals ?? 10)),
        requireMemberActivePackage: row.requireMemberActivePackage !== false,
        requireDirectActivePackage: row.requireDirectActivePackage !== false,
        directMustRegisterInCampaignWindow: row.directMustRegisterInCampaignWindow !== false,
      }
    })
    .filter((t) => t.rewardLabel.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    id,
    title: String(data.title ?? 'Referral rewards'),
    subtitle: data.subtitle != null ? String(data.subtitle) : undefined,
    theme: data.theme != null ? String(data.theme) : undefined,
    active: data.active === true,
    startAt: Number(data.startAt ?? 0),
    endAt: Number(data.endAt ?? 0),
    tiers,
    bannerEnabled: data.bannerEnabled !== false,
    bannerTitle: data.bannerTitle != null ? String(data.bannerTitle) : undefined,
    bannerMessage: String(data.bannerMessage ?? ''),
    bannerImageUrl: data.bannerImageUrl != null ? String(data.bannerImageUrl) : undefined,
    bannerDismissVersion: Math.max(0, Number(data.bannerDismissVersion ?? 0)),
    updatedAt: Number(data.updatedAt ?? 0),
  }
}

async function pickActiveReferralCampaign(now = Date.now()) {
  const snap = await db.collection(COL_REFERRAL_CAMPAIGNS).where('active', '==', true).get()
  const candidates = snap.docs
    .map((d) => mapReferralCampaignDoc(d.id, d.data() as Record<string, unknown>))
    .filter((c) => c.startAt > 0 && c.endAt > 0 && now >= c.startAt && now <= c.endAt)
    .sort((a, b) => b.startAt - a.startAt)
  return candidates[0] ?? null
}

async function countQualifyingDirectsForTier(
  sponsorUid: string,
  campaign: { startAt: number; endAt: number },
  tier: ReferralCampaignTierRow,
): Promise<number> {
  const snap = await db.collection(COL_USERS).where('sponsorUid', '==', sponsorUid).get()
  let count = 0
  const inWindow = tier.directMustRegisterInCampaignWindow !== false
  const requireActive = tier.requireDirectActivePackage !== false
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    const created = Number(data.createdAt ?? 0)
    if (inWindow && (created < campaign.startAt || created > campaign.endAt)) continue
    if (requireActive && !(await hasAtLeastOneActivePackage(d.id))) continue
    count++
  }
  return count
}

function memberJoinRequirementMet(
  tier: ReferralCampaignTierRow,
  memberPrincipal: number,
  hasActive: boolean,
): boolean {
  const minAmt = Number(tier.minMemberPackageAmount ?? 0)
  if (tier.requireMemberActivePackage !== false && !hasActive) return false
  if (minAmt > 0 && memberPrincipal < minAmt) return false
  return true
}

function tierProgressPercent(
  tier: ReferralCampaignTierRow,
  qualifyingDirectCount: number,
  memberPrincipal: number,
  memberJoinMet: boolean,
): number {
  const req = Math.max(1, tier.requiredDirectReferrals)
  const directPct = Math.min(1, qualifyingDirectCount / req)
  const minAmt = Number(tier.minMemberPackageAmount ?? 0)
  let joinPct = 1
  if (minAmt > 0) joinPct = memberJoinMet ? 1 : Math.min(1, memberPrincipal / minAmt)
  else if (!memberJoinMet) joinPct = 0
  /** Overall = slowest requirement (both must be 100% to complete). */
  return Math.round(100 * Math.min(directPct, joinPct))
}

/** Member dashboard: referral promo progress for the active in-window campaign. */
export const getReferralCampaignProgress = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const campaign = await pickActiveReferralCampaign()
  if (!campaign) {
    return { campaign: null, qualifyingDirectCount: 0, memberPrincipal: 0, tiers: [] }
  }
  const memberPrincipal = await maxActivePrincipalForUser(uid)
  const hasActive = await hasAtLeastOneActivePackage(uid)
  const tiersOut = []
  let topDirects = 0
  for (const tier of campaign.tiers) {
    const qualifyingDirectCount = await countQualifyingDirectsForTier(uid, campaign, tier)
    topDirects = Math.max(topDirects, qualifyingDirectCount)
    const memberJoinMet = memberJoinRequirementMet(tier, memberPrincipal, hasActive)
    const completed =
      qualifyingDirectCount >= tier.requiredDirectReferrals && memberJoinMet
    tiersOut.push({
      tierId: tier.id,
      sortOrder: tier.sortOrder,
      rewardLabel: tier.rewardLabel,
      rewardSubtitle: tier.rewardSubtitle,
      minMemberPackageAmount: tier.minMemberPackageAmount,
      requiredDirectReferrals: tier.requiredDirectReferrals,
      qualifyingDirectCount,
      memberPrincipal,
      memberJoinMet,
      completed,
      progressPercent: completed
        ? 100
        : tierProgressPercent(tier, qualifyingDirectCount, memberPrincipal, memberJoinMet),
    })
  }
  return {
    campaign,
    qualifyingDirectCount: topDirects,
    memberPrincipal,
    tiers: tiersOut,
  }
})

type DirectRefForCampaign = { uid: string; createdAt: number }

function countQualifyingDirectsIndexed(
  sponsorUid: string,
  campaign: { startAt: number; endAt: number },
  tier: ReferralCampaignTierRow,
  directsBySponsor: Map<string, DirectRefForCampaign[]>,
  activeUserIds: Set<string>,
): number {
  const directs = directsBySponsor.get(sponsorUid) ?? []
  let count = 0
  const inWindow = tier.directMustRegisterInCampaignWindow !== false
  const requireActive = tier.requireDirectActivePackage !== false
  for (const d of directs) {
    if (inWindow && (d.createdAt < campaign.startAt || d.createdAt > campaign.endAt)) continue
    if (requireActive && !activeUserIds.has(d.uid)) continue
    count++
  }
  return count
}

/** Admin: members who completed each reward tier for a campaign. */
export const adminListReferralCampaignCompletions = onCall(
  { ...callableRuntimeOpts, memory: '512MiB' as const, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
    await assertFirestoreAdmin(request.auth.uid)

    const campaignId = String((request.data as { campaignId?: string })?.campaignId ?? '').trim()
    const tierIdFilter = String((request.data as { tierId?: string })?.tierId ?? '').trim()
    if (!campaignId) throw new HttpsError('invalid-argument', 'campaignId is required')

    const cSnap = await db.collection(COL_REFERRAL_CAMPAIGNS).doc(campaignId).get()
    if (!cSnap.exists) throw new HttpsError('not-found', 'Campaign not found')
    const campaign = mapReferralCampaignDoc(campaignId, cSnap.data() as Record<string, unknown>)

    const [usersSnap, activeSnap] = await Promise.all([
      db.collection(COL_USERS).get(),
      db.collection(COL_ACTIVE).where('status', '==', 'active').get(),
    ])

    const activeUserIds = new Set<string>()
    const maxPrincipalByUser = new Map<string, number>()
    for (const d of activeSnap.docs) {
      const uid = String(d.data().userId ?? '')
      if (!uid) continue
      activeUserIds.add(uid)
      const amt = Number(d.data().amount ?? 0)
      maxPrincipalByUser.set(uid, Math.max(maxPrincipalByUser.get(uid) ?? 0, amt))
    }

    const directsBySponsor = new Map<string, DirectRefForCampaign[]>()
    const members: Array<{ uid: string; data: Record<string, unknown> }> = []
    for (const d of usersSnap.docs) {
      const data = d.data() as Record<string, unknown>
      if (String(data.role ?? '') === 'admin') continue
      members.push({ uid: d.id, data })
      const sponsorUid = String(data.sponsorUid ?? '').trim()
      if (!sponsorUid) continue
      const list = directsBySponsor.get(sponsorUid) ?? []
      list.push({ uid: d.id, createdAt: Number(data.createdAt ?? 0) })
      directsBySponsor.set(sponsorUid, list)
    }

    const completions: Array<{
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
    }> = []

    for (const { uid, data } of members) {
      const memberPrincipal = maxPrincipalByUser.get(uid) ?? 0
      const hasActive = activeUserIds.has(uid)
      for (const tier of campaign.tiers) {
        if (tierIdFilter && tier.id !== tierIdFilter) continue
        const qualifyingDirectCount = countQualifyingDirectsIndexed(
          uid,
          campaign,
          tier,
          directsBySponsor,
          activeUserIds,
        )
        const memberJoinMet = memberJoinRequirementMet(tier, memberPrincipal, hasActive)
        if (qualifyingDirectCount >= tier.requiredDirectReferrals && memberJoinMet) {
          completions.push({
            uid,
            username: String(data.username ?? ''),
            fullName: String(data.fullName ?? ''),
            email: String(data.email ?? ''),
            phone: String(data.phone ?? ''),
            tierId: tier.id,
            rewardLabel: tier.rewardLabel,
            rewardSubtitle: tier.rewardSubtitle,
            qualifyingDirectCount,
            memberPrincipal,
          })
        }
      }
    }

    completions.sort(
      (a, b) =>
        a.tierId.localeCompare(b.tierId) ||
        a.username.localeCompare(b.username, undefined, { numeric: true }),
    )

    await audit(request.auth.uid, 'adminListReferralCampaignCompletions', {
      campaignId,
      tierIdFilter: tierIdFilter || undefined,
      total: completions.length,
    })

    return {
      campaign: { id: campaign.id, title: campaign.title },
      completions,
      total: completions.length,
    }
  },
)

/** Persist banner dismiss on the user profile (Firestore rules block direct member writes). */
export const dismissReferralCampaignBanner = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const uid = request.auth.uid
  const campaignId = String((request.data as { campaignId?: string })?.campaignId ?? '').trim()
  if (!campaignId) throw new HttpsError('invalid-argument', 'campaignId is required')

  const cSnap = await db.collection(COL_REFERRAL_CAMPAIGNS).doc(campaignId).get()
  if (!cSnap.exists) throw new HttpsError('not-found', 'Campaign not found')
  const version = Math.max(0, Number(cSnap.data()?.bannerDismissVersion ?? 0))
  const uRef = db.collection(COL_USERS).doc(uid)

  await db.runTransaction(async (tx) => {
    const uSnap = await tx.get(uRef)
    const prev =
      uSnap.exists && uSnap.data()?.dismissedReferralCampaignBanners != null
        ? (uSnap.data()!.dismissedReferralCampaignBanners as Record<string, number>)
        : {}
    tx.set(
      uRef,
      {
        dismissedReferralCampaignBanners: { ...prev, [campaignId]: version },
        updatedAt: Date.now(),
      },
      { merge: true },
    )
  })
  return { ok: true, campaignId, version }
})

/** Push the same notification document to every user (batched). */
export const adminBroadcastNotification = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as { title?: string; body?: string }
  const title = String(data.title || '').trim()
  const body = String(data.body || '').trim()
  if (!title || !body) {
    throw new HttpsError('invalid-argument', 'Title and body required')
  }

  const snap = await db.collection(COL_USERS).get()
  let total = 0
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    for (const d of docs.slice(i, i + 400)) {
      const ref = db.collection('notifications').doc()
      batch.set(ref, {
        userId: d.id,
        title,
        body,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
      total++
    }
    await batch.commit()
  }

  await audit(actorUid, 'adminBroadcastNotification', { total, title })
  return { sent: total }
})

/** Writes reference compensation rows only when their doc id is missing (safe to run multiple times). */
export const adminSeedCompensationDefaults = onCall(callableRuntimeOpts, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required')
  const actorUid = request.auth.uid
  await assertFirestoreAdmin(actorUid)

  const data = request.data as {
    seedTeamLevels?: boolean
    seedRanks?: boolean
    seedCompoundPlans?: boolean
    seedWithdrawDefaults?: boolean
  } | undefined
  const seedTeamLevels = data?.seedTeamLevels !== false
  const seedRanks = data?.seedRanks !== false
  const seedCompoundPlans = data?.seedCompoundPlans === true
  const seedWithdrawDefaults = data?.seedWithdrawDefaults === true

  let teamLevelsInserted = 0
  let ranksInserted = 0
  let compoundPlansInserted = 0

  if (seedTeamLevels) {
    for (const row of REFERENCE_TEAM_LEVEL_SEED) {
      const ref = db.collection(COL_TEAM_LEVELS).doc(row.id)
      const ex = await ref.get()
      if (!ex.exists) {
        await ref.set({
          level: row.level,
          percent: row.percent,
          requiredDirects: row.requiredDirects,
          conditionDescription: row.conditionDescription,
          sortOrder: row.sortOrder,
          uplineDurationCapPercent: row.uplineDurationCapPercent,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        teamLevelsInserted++
      }
    }
  }

  if (seedRanks) {
    for (const row of REFERENCE_RANK_SEED) {
      const ref = db.collection(COL_RANKS).doc(row.id)
      const ex = await ref.get()
      if (!ex.exists) {
        await ref.set({
          name: row.name,
          requiredTeamBusiness: row.requiredTeamBusiness,
          dailyReward: row.dailyReward,
          rewardDurationDays: row.rewardDurationDays,
          totalReward: row.totalReward,
          sortOrder: row.sortOrder,
          active: true,
          updatedAt: Date.now(),
        })
        ranksInserted++
      }
    }
  }

  if (seedCompoundPlans) {
    for (const row of REFERENCE_COMPOUNDING_PLANS) {
      const ref = db.collection(COL_PACKAGES).doc(row.id)
      const ex = await ref.get()
      if (!ex.exists) {
        const roi = compoundRoiPercentForDoubleInDays(row.durationDays)
        await ref.set({
          name: row.name,
          minAmount: row.amount,
          maxAmount: row.amount,
          roiPercent: roi,
          durationDays: row.durationDays,
          maxRoiMultiplier: row.maxRoiMultiplier,
          packageShelf: 'compounding',
          active: true,
          description: 'Rich Compounding — accumulates to 2× cap (snapshot at activation).',
          sortOrder: row.sortOrder,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        compoundPlansInserted++
      }
    }
  }

  const cfgRef = db.collection(COL_SETTINGS).doc('config')
  const cfgSnap = await cfgRef.get()
  const c = cfgSnap.data() ?? {}
  const ratioPatch: Record<string, unknown> = {}
  if (c.rankQualificationPowerPercent == null) ratioPatch.rankQualificationPowerPercent = 50
  if (c.rankQualificationRestPercent == null) ratioPatch.rankQualificationRestPercent = 50

  let withdrawDefaultsApplied = false
  if (seedWithdrawDefaults) {
    const withdrawSeed: Record<string, unknown> = {}
    if (!Array.isArray(c.withdrawPackageCaps) || (c.withdrawPackageCaps as unknown[]).length === 0) {
      withdrawSeed.withdrawPackageCaps = REFERENCE_WITHDRAW_PACKAGE_CAPS_SEED.map((row) => ({ ...row }))
    }
    if (c.minWithdrawal == null) withdrawSeed.minWithdrawal = 10
    if (c.withdrawFeePercent == null) withdrawSeed.withdrawFeePercent = 10
    if (c.withdrawalsEnabled === undefined) withdrawSeed.withdrawalsEnabled = true
    if (c.withdrawNetworkLabel == null) withdrawSeed.withdrawNetworkLabel = 'USDT BEP-20'
    if (c.withdrawalWindowStart == null) withdrawSeed.withdrawalWindowStart = '10:30'
    if (c.withdrawalWindowEnd == null) withdrawSeed.withdrawalWindowEnd = '13:30'
    if (c.withdrawalWindowTimezone == null) withdrawSeed.withdrawalWindowTimezone = 'Etc/UTC'
    if (!Array.isArray(c.withdrawalAllowedWeekdays) || c.withdrawalAllowedWeekdays.length === 0) {
      withdrawSeed.withdrawalAllowedWeekdays = [1, 2, 3, 4, 5, 6]
    }
    if (c.withdrawalRequiresActivePackage === undefined) withdrawSeed.withdrawalRequiresActivePackage = true
    if (c.withdrawalProcessingIntervalHours == null) withdrawSeed.withdrawalProcessingIntervalHours = 48
    if (c.withdrawalProcessingMode == null) withdrawSeed.withdrawalProcessingMode = 'manual'
    if (c.withdrawalCooldownHours == null) withdrawSeed.withdrawalCooldownHours = 78
    if (c.withdrawalAmountStep == null) withdrawSeed.withdrawalAmountStep = 10
    if (c.defaultWithdrawalPercentOfPackage == null) withdrawSeed.defaultWithdrawalPercentOfPackage = 20
    if (Object.keys(withdrawSeed).length > 0) {
      withdrawDefaultsApplied = true
      await cfgRef.set(
        {
          ...withdrawSeed,
          withdrawPoliciesVersion: FieldValue.increment(1),
          updatedAt: Date.now(),
        },
        { merge: true },
      )
    }
  }

  if (Object.keys(ratioPatch).length > 0) {
    await cfgRef.set({ ...ratioPatch, updatedAt: Date.now() }, { merge: true })
  }

  await audit(actorUid, 'adminSeedCompensationDefaults', {
    teamLevelsInserted,
    ranksInserted,
    compoundPlansInserted,
    withdrawDefaultsApplied,
    seedTeamLevels,
    seedRanks,
    seedCompoundPlans,
    seedWithdrawDefaults,
  })
  return {
    ok: true,
    teamLevelsInserted,
    ranksInserted,
    compoundPlansInserted,
    withdrawDefaultsApplied,
  }
})

const ROI_CALENDAR_TZ = 'Asia/Kolkata'

/** YYYY-MM-DD in IST for `when`. */
function istDayKey(when = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ROI_CALENDAR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when)
}

function normalizeRoiOffDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const d of raw) {
    const s = String(d).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out.add(s)
  }
  return [...out]
}

/** Sunday (IST) — legacy helper. Prefer `istWeekdayIndex` + `roiOffWeekdays`. */
function isSundayIst(now: Date = new Date()): boolean {
  return istWeekdayIndex(now) === 0
}

function istWeekdayIndex(when = new Date()): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: ROI_CALENDAR_TZ, weekday: 'short' }).format(when)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

function normalizeRoiOffWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [0]
  const out = [
    ...new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ].sort((a, b) => a - b)
  return out.length > 0 ? out : [0]
}

/** Skip nightly ROI + team level when weekday is in admin `roiOffWeekdays` or date is in `roiOffDates`. */
function shouldSkipDailyRoiRun(settings: Record<string, unknown> | undefined, when = new Date()): boolean {
  if (normalizeRoiOffWeekdays(settings?.roiOffWeekdays).includes(istWeekdayIndex(when))) return true
  return normalizeRoiOffDates(settings?.roiOffDates).includes(istDayKey(when))
}

/** Daily ROI accrual at 00:00 India Standard Time (Asia/Kolkata, UTC+5:30). */
export const processDailyRoi = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {}
  if (settings.roiEnabled === false) {
    return
  }
  if (shouldSkipDailyRoiRun(settings)) {
    return
  }
  const now = Timestamp.now()
  const snap = await db.collection(COL_ACTIVE).where('status', '==', 'active').get()

  for (const docSnap of snap.docs) {
    const ap = docSnap.data()
    const endsAt = ap.endsAt as Timestamp
    const userIdEarly = String(ap.userId ?? '')
    if (endsAt.toMillis() < now.toMillis()) {
      await docSnap.ref.set({ status: 'completed', updatedAt: now }, { merge: true })
      if (userIdEarly) await maybeDecrementSponsorActiveDirectsWhenNoActivePackages(userIdEarly)
      continue
    }

    /** Admin can pause daily ROI for a specific active package (member retains other plans). */
    if (ap.adminRoiPaused === true) {
      continue
    }

    const amount = Number(ap.amount ?? 0)
    const userId = userIdEarly

    const userRow = await db.collection(COL_USERS).doc(userId).get()
    if (!userRow.exists || Boolean(userRow.data()?.blocked)) {
      continue
    }

    const userData = userRow.data() as Record<string, unknown>
    const planSnap = effectivePlanSnapshotForActivePackage(ap, userData)

    if (await shouldSkipRoiForPackageOwner(userId, planSnap)) {
      continue
    }

    const roiPercent = Number(
      planSnap.roiPercent != null ? planSnap.roiPercent : ap.roiPercent ?? 0,
    )
    const nonWorkingPaid = Number(ap.nonWorkingPaid ?? 0)
    const nwMult = Number(
      ap.frozenNonWorkingCapMultiplier ??
        (planSnap?.nonWorkingIncomeCapMultiplier as number | undefined) ??
        2,
    )
    const cap = amount * Math.max(nwMult, 0)
    const headroom = Math.max(0, cap - nonWorkingPaid)
    /** NW bucket full — stay `active` so sponsor/team income can continue until plan ends or working cap is hit. */
    if (headroom <= 1e-12) {
      continue
    }

    const planTypeStr = String(planSnap.planType != null ? planSnap.planType : ap.planType ?? 'daily').toLowerCase()
    const compound = planTypeStr === 'compounding'
    const bal = compound ? Number(ap.compoundingBalance ?? amount) : amount
    const rawDaily = (bal * roiPercent) / 100
    const daily = Math.min(rawDaily, headroom)
    if (daily <= 1e-12) {
      continue
    }

    const newPaid = nonWorkingPaid + daily
    const hitCap = newPaid >= cap - 1e-9
    const patch: Record<string, unknown> = { nonWorkingPaid: newPaid, updatedAt: now }
    if (compound) patch.compoundingBalance = bal + daily
    if (hitCap) {
      patch.nonWorkingRoiSaturated = true
    }
    await docSnap.ref.update(patch)
    await db.collection(COL_USERS).doc(userId).update({
      'wallets.cash': FieldValue.increment(daily),
      dailyProfitsTotal: FieldValue.increment(daily),
      nonWorkingIncomeBalance: FieldValue.increment(daily),
      updatedAt: Date.now(),
    })

    await db.collection(COL_DAILY).add({
      userId,
      amount: daily,
      activePackageId: docSnap.id,
      createdAt: FieldValue.serverTimestamp(),
    })

    const startedAt = ap.startedAt as Timestamp
    const durationDays = Number(
      planSnap.durationDays != null ? planSnap.durationDays : ap.durationDays ?? 0,
    )
    await distributeTeamLevelIncomeFromDailyRoi(docSnap.id, userId, daily, planSnap, {
      startedAt,
      now,
      durationDays,
    })
  }
  },
)

/**
 * Scheduled ranking bonus drip: each user with an active rank payout schedule gets at most one
 * credit per UTC day; milestones and ratios use `rankCompensationSnapshot` when present.
 */
export const processDailyRankRewards = onSchedule(
  {
    schedule: '30 3 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
    if (settingsSnap.exists && settingsSnap.data()?.rankRewardsEnabled === false) {
      return
    }

    const dayKey = new Date().toISOString().slice(0, 10)
    let last: QueryDocumentSnapshot | undefined
    const pageSize = 400
    for (;;) {
      let q = db.collection(COL_USERS).orderBy(FieldPath.documentId()).limit(pageSize)
      if (last) q = q.startAfter(last)
      const page = await q.get()
      if (page.empty) break

      for (const docSnap of page.docs) {
        await processRankRewardForUser(docSnap.id, dayKey)
      }

      last = page.docs[page.docs.length - 1]
      if (page.size < pageSize) break
    }
  },
)

/** When withdrawal processing mode is auto, completes approved rows on the configured cadence (~48h). */
export const processAutoWithdrawals = onSchedule(
  {
    schedule: '15 */6 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const cfgRef = db.collection(COL_SETTINGS).doc('config')
    const settingsSnap = await cfgRef.get()
    const st = settingsSnap.data() ?? {}
    if (String(st.withdrawalProcessingMode ?? 'manual').toLowerCase() !== 'auto') return
    if (st.withdrawalsEnabled === false) return
    const hrs = Math.min(336, Math.max(1, Number(st.withdrawalProcessingIntervalHours ?? 48)))
    const last = Number(st.lastAutoWithdrawalRunAt ?? 0)
    if (Date.now() - last < hrs * 3600000 - 60_000) return

    const q = await db.collection(COL_WITHDRAWALS).where('status', '==', 'approved').get()
    for (const d of q.docs) {
      await d.ref.set(
        {
          status: 'paid',
          txId: 'AUTO_PENDING_TX',
          autoMarkedPaid: true,
          paidAt: FieldValue.serverTimestamp(),
          updatedAt: Date.now(),
        },
        { merge: true },
      )
      const row = d.data()
      await db.collection('notifications').add({
        userId: String(row.userId ?? ''),
        title: 'Withdrawal completed',
        body: 'Your withdrawal was processed by the automated payout cycle. Reference: AUTO_PENDING_TX',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    await cfgRef.set({ lastAutoWithdrawalRunAt: Date.now() }, { merge: true })
  },
)
