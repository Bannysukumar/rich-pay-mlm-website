"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAutoWithdrawals = exports.processDailyRankRewards = exports.processDailyRoi = exports.adminSeedCompensationDefaults = exports.adminBroadcastNotification = exports.adminDeleteMember = exports.adminAdjustMemberBalances = exports.adminRepairWalletShadowFields = exports.adminFinalizeDeposit = exports.adminWithdrawalUpdate = exports.internalTransfer = exports.convertIncomeToActivation = exports.walletConvert = exports.createWithdrawal = exports.activatePackage = exports.requestPasswordReset = exports.publicResolveReferrer = exports.resolveUsername = exports.listAllDownlines = exports.listDirectReferrals = exports.changeTransactionPassword = exports.updateMemberProfile = exports.registerWithProfile = void 0;
const node_crypto_1 = require("node:crypto");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const compoundingDefaults_1 = require("./compoundingDefaults");
const compensationDefaults_1 = require("./compensationDefaults");
admin.initializeApp();
const db = admin.firestore();
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
    invoker: 'public',
};
const USERNAME_START = 4448550;
const COL_USERS = 'users';
const COL_USERS_BY_UN = 'usersByUsername';
const COL_COUNTERS = 'counters';
const COL_PHONE = 'phoneIndex';
const COL_SETTINGS = 'siteSettings';
const COL_PACKAGES = 'packages';
const COL_ACTIVE = 'activePackages';
const COL_DEPOSITS = 'deposits';
const COL_WITHDRAWALS = 'withdrawals';
const COL_DAILY = 'dailyProfits';
const COL_INTERNAL = 'internalTransfers';
/**
 * When `allowActivationTransferToAnyUser` is on, treat package top-up the same as activation
 * transfers: any valid member UserID may receive the package (matches admin expectation on
 * Transfer settings). When that flag is off, `restrictPackageTopupToDirectReferrals === true`
 * limits beneficiaries to self + direct referrals only.
 */
function enforcePackageTopupDirectReferralOnly(settings) {
    const s = settings ?? {};
    if (Boolean(s.allowActivationTransferToAnyUser))
        return false;
    return s.restrictPackageTopupToDirectReferrals === true;
}
const COL_TEAM_LEVELS = 'teamLevels';
const COL_RANKS = 'ranks';
const REFERENCE_WITHDRAW_PACKAGE_CAPS_SEED = [
    { packageAmount: 100, maxWithdrawal: 20, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 10 },
    { packageAmount: 200, maxWithdrawal: 40, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 20 },
    { packageAmount: 300, maxWithdrawal: 60, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 30 },
    { packageAmount: 400, maxWithdrawal: 80, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 40 },
    { packageAmount: 500, maxWithdrawal: 100, usePercentFormula: false, percentOfPackage: 20, active: true, sortOrder: 50 },
];
function freezeWithdrawPolicyFromSettings(settings) {
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
        withdrawalProcessingIntervalHours: Number(settings.withdrawalProcessingIntervalHours ?? 48),
        withdrawalProcessingMode: String(settings.withdrawalProcessingMode ?? 'manual'),
        withdrawalCooldownHours: Number(settings.withdrawalCooldownHours ?? 78),
        withdrawalAmountStep: Number(settings.withdrawalAmountStep ?? 10),
        withdrawPackageCaps: Array.isArray(settings.withdrawPackageCaps) ? settings.withdrawPackageCaps : [],
        defaultWithdrawalPercentOfPackage: Number(settings.defaultWithdrawalPercentOfPackage ?? 20),
    };
}
/** Keep in sync with `mergeWithdrawPolicy` in `src/lib/withdrawPolicy.ts`. */
function mergeWithdrawPolicyForUser(livePol, frozen) {
    if (!frozen || typeof frozen !== 'object' || Object.keys(frozen).length === 0) {
        return { ...livePol };
    }
    const merged = { ...livePol };
    const caps = frozen.withdrawPackageCaps;
    if (Array.isArray(caps) && caps.length > 0) {
        merged.withdrawPackageCaps = caps;
    }
    const defPct = frozen.defaultWithdrawalPercentOfPackage;
    if (defPct !== undefined && Number.isFinite(Number(defPct))) {
        merged.defaultWithdrawalPercentOfPackage = Number(defPct);
    }
    /** Withdrawal time window always follows live site settings (never activation snapshot). */
    merged.withdrawalWindowStart = livePol.withdrawalWindowStart;
    merged.withdrawalWindowEnd = livePol.withdrawalWindowEnd;
    merged.withdrawalWindowTimezone = livePol.withdrawalWindowTimezone;
    return merged;
}
function wallClockMinutes(date, timeZone) {
    try {
        const fmt = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
            hourCycle: 'h23',
            calendar: 'gregory',
        });
        const parts = fmt.formatToParts(date);
        const h = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
        const m = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN);
        if (!Number.isFinite(h) || !Number.isFinite(m))
            return null;
        return h * 60 + m;
    }
    catch {
        return null;
    }
}
function parseHmToMinutes(hm) {
    const x = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim());
    if (!x)
        return null;
    const hh = Number(x[1]);
    const mm = Number(x[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59)
        return null;
    return hh * 60 + mm;
}
/** True if local time (policy TZ) falls within [start,end] inclusive. */
function isWithinWithdrawalWindow(policy, date = new Date()) {
    const tz = String(policy.withdrawalWindowTimezone ?? 'Etc/UTC');
    const nowM = wallClockMinutes(date, tz);
    let s = parseHmToMinutes(String(policy.withdrawalWindowStart ?? '00:00'));
    let e = parseHmToMinutes(String(policy.withdrawalWindowEnd ?? '23:59'));
    if (nowM === null || s === null || e === null)
        return true;
    if (s <= e)
        return nowM >= s && nowM <= e;
    return nowM >= s || nowM <= e;
}
/** Package top-up: 50% from activation wallet, 50% from deposit (cent-safe; halves sum to `amount`). */
function splitTopupWalletDebit(amount) {
    const cents = Math.round(amount * 100);
    if (cents <= 0)
        return { activation: 0, deposit: 0 };
    const halfActCents = Math.floor(cents / 2);
    const halfDepCents = cents - halfActCents;
    return { activation: halfActCents / 100, deposit: halfDepCents / 100 };
}
/** Non-working daily ROI cap as × principal; explicit `0` on the package = no non-working ROI. */
function resolveNonWorkingCapMultiplierFromPackage(pkg, siteDefault) {
    if (Object.prototype.hasOwnProperty.call(pkg, 'maxRoiMultiplier') && pkg.maxRoiMultiplier != null) {
        const n = Number(pkg.maxRoiMultiplier);
        if (Number.isFinite(n))
            return Math.max(0, n);
    }
    return Math.max(0, siteDefault);
}
/** Working-income (sponsor / team / rank) cap as × stake; omit field on package → site default. */
function resolveWorkingCapMultiplierFromPackage(pkg, siteDefault) {
    if (Object.prototype.hasOwnProperty.call(pkg, 'workingIncomeCapMultiplier') &&
        pkg.workingIncomeCapMultiplier != null) {
        const n = Number(pkg.workingIncomeCapMultiplier);
        if (Number.isFinite(n))
            return Math.max(0, n);
    }
    return Math.max(0, siteDefault);
}
async function maxActivePrincipalForUser(uid) {
    const snap = await db.collection(COL_ACTIVE).where('userId', '==', uid).where('status', '==', 'active').get();
    let mx = 0;
    for (const d of snap.docs) {
        mx = Math.max(mx, Number(d.data()?.amount ?? 0));
    }
    return mx;
}
/** Sponsor / team / rank drip pay only when the earner has ≥1 active stake (any plan type). */
async function hasAtLeastOneActivePackage(uid) {
    const u = String(uid ?? '').trim();
    if (!u)
        return false;
    const snap = await db.collection(COL_ACTIVE).where('userId', '==', u).where('status', '==', 'active').limit(1).get();
    return !snap.empty;
}
function workingIncomeCreditedTotal(ud) {
    if (!ud)
        return 0;
    const totals = ud.userTotals;
    const explicit = Number(totals?.totalWorkingIncome ?? NaN);
    if (Number.isFinite(explicit) && explicit >= 0)
        return explicit;
    return (Number(ud.sponsorBonusTotal ?? 0) +
        Number(ud.teamLevelCommissionTotal ?? 0) +
        Number(ud.rankCommissionTotal ?? 0));
}
/** Σ (principal × frozen working mult) across this member’s active packages. */
async function computeUserWorkingIncomeCeiling(uid) {
    const snap = await db.collection(COL_ACTIVE).where('userId', '==', uid).where('status', '==', 'active').get();
    let sum = 0;
    for (const d of snap.docs) {
        const x = d.data();
        const amt = Number(x.amount ?? 0);
        const ps = x.planSnapshot;
        const mult = Number(x.frozenWorkingCapMultiplier ??
            (ps != null && ps.workingIncomeCapMultiplier != null ? Number(ps.workingIncomeCapMultiplier) : undefined) ??
            3);
        sum += amt * Math.max(0, mult);
    }
    return sum;
}
async function userWorkingIncomeRemaining(uid) {
    const us = await db.collection(COL_USERS).doc(uid).get();
    const ceiling = await computeUserWorkingIncomeCeiling(uid);
    const credited = workingIncomeCreditedTotal(us.data());
    return Math.max(0, ceiling - credited);
}
/** Skip ROI for this package when snapshot says stop-all and user has no working-income room left. */
async function shouldSkipRoiForPackageOwner(userId, planSnap) {
    if (!planSnap || planSnap.stopAllIncomeWhenWorkingCapReached !== true)
        return false;
    const rem = await userWorkingIncomeRemaining(userId);
    return rem <= 1e-9;
}
/** Block rank drip when user exhausted working cap and at least one active package has stop-all snapshot. */
async function shouldBlockRankPayoutForWorkingCap(uid) {
    const rem = await userWorkingIncomeRemaining(uid);
    if (rem > 1e-9)
        return false;
    const snap = await db.collection(COL_ACTIVE).where('userId', '==', uid).where('status', '==', 'active').get();
    for (const d of snap.docs) {
        const ps = d.data()?.planSnapshot;
        if (ps && ps.stopAllIncomeWhenWorkingCapReached === true)
            return true;
    }
    return false;
}
function computeMaxWithdrawalForPrincipal(principal, policy) {
    if (principal <= 0)
        return 0;
    const caps = Array.isArray(policy.withdrawPackageCaps)
        ? policy.withdrawPackageCaps
        : [];
    const usable = caps.filter((row) => row && row.active !== false);
    const exact = usable.find((row) => Number(row.packageAmount ?? -999) === principal);
    if (exact != null) {
        if (exact.usePercentFormula === true)
            return (principal * Number(exact.percentOfPackage ?? 20)) / 100;
        return Math.max(0, Number(exact.maxWithdrawal ?? 0));
    }
    const fallbackPct = Number(policy.defaultWithdrawalPercentOfPackage ?? 20);
    return (principal * fallbackPct) / 100;
}
function isWithdrawalAmountStepValid(amount, step) {
    if (!Number.isFinite(amount) || amount <= 0)
        return false;
    const s = Math.max(1, Math.floor(Number(step) || 10));
    const cents = Math.round(amount * 100);
    return cents > 0 && cents % (s * 100) === 0;
}
async function lastNonRejectedWithdrawalCreatedMs(userId) {
    const snap = await db
        .collection(COL_WITHDRAWALS)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(25)
        .get();
    for (const doc of snap.docs) {
        const st = String(doc.data().status ?? '');
        if (st === 'rejected')
            continue;
        const created = doc.data().createdAt;
        if (created && typeof created === 'object' && typeof created.toMillis === 'function') {
            return created.toMillis();
        }
        if (typeof created === 'number' && Number.isFinite(created))
            return created;
    }
    return null;
}
function normalizePowerRestPercent(pRaw, rRaw) {
    let p = Math.max(0, Number(pRaw));
    let r = Math.max(0, Number(rRaw));
    const s = p + r;
    if (!Number.isFinite(s) || s <= 0)
        return { p: 50, r: 50 };
    return { p: (p / s) * 100, r: (r / s) * 100 };
}
function teamLevelDocTimeMs(x) {
    const u = x.updatedAt;
    if (u != null && typeof u.toMillis === 'function') {
        return u.toMillis();
    }
    if (typeof u === 'number' && Number.isFinite(u))
        return u;
    const c = x.createdAt;
    if (c != null && typeof c.toMillis === 'function') {
        return c.toMillis();
    }
    if (typeof c === 'number' && Number.isFinite(c))
        return c;
    return 0;
}
/** Reference seed doc ids (`seed_lvl_N`) — used only to break ties when two active rows share the same level. */
function isSeedTeamLevelDocId(id) {
    return /^seed_lvl_\d+$/i.test(id);
}
function betterTeamLevelDoc(a, b) {
    if (b.ts > a.ts)
        return b;
    if (b.ts < a.ts)
        return a;
    if (isSeedTeamLevelDocId(a.id) && !isSeedTeamLevelDocId(b.id))
        return b;
    if (!isSeedTeamLevelDocId(a.id) && isSeedTeamLevelDocId(b.id))
        return a;
    return b.id >= a.id ? b : a;
}
function frozenRowFromTeamLevelData(lvl, x) {
    const desc = x.conditionDescription != null ? String(x.conditionDescription).trim() : '';
    const rawCap = Number(x.uplineDurationCapPercent ?? compensationDefaults_1.DEFAULT_UPLINE_DURATION_CAP_PERCENT);
    const uplineDurationCapPercent = Math.max(0, Math.min(100, Number.isFinite(rawCap) ? rawCap : compensationDefaults_1.DEFAULT_UPLINE_DURATION_CAP_PERCENT));
    return {
        level: lvl,
        percent: Number(x.percent ?? 0),
        requiredDirects: Number(x.requiredDirects ?? x.directs ?? 0),
        uplineDurationCapPercent,
        ...(desc ? { conditionDescription: desc } : {}),
    };
}
/**
 * Snapshot team matrix at activation. If multiple **active** rows share the same `level` (duplicate
 * configs), pick the one with the latest `updatedAt`/`createdAt` so admin edits win over stale rows.
 */
async function freezeTeamLevelsForActivation(maxLevels) {
    const cap = Math.min(100, Math.max(1, maxLevels));
    const snap = await db.collection(COL_TEAM_LEVELS).where('active', '==', true).get();
    const winners = new Map();
    for (const d of snap.docs) {
        const x = d.data();
        const lvl = Number(x.level ?? 0);
        if (!Number.isFinite(lvl) || lvl < 1)
            continue;
        const ts = teamLevelDocTimeMs(x);
        const cand = { id: d.id, ts, data: x };
        const cur = winners.get(lvl);
        if (!cur) {
            winners.set(lvl, cand);
            continue;
        }
        winners.set(lvl, betterTeamLevelDoc(cur, cand));
    }
    const byLevel = new Map();
    for (const [lvl, pick] of winners) {
        byLevel.set(lvl, frozenRowFromTeamLevelData(lvl, pick.data));
    }
    return Array.from({ length: cap }, (_, i) => {
        const L = i + 1;
        return (byLevel.get(L) ?? {
            level: L,
            percent: 0,
            requiredDirects: 0,
            conditionDescription: '',
            uplineDurationCapPercent: compensationDefaults_1.DEFAULT_UPLINE_DURATION_CAP_PERCENT,
        });
    });
}
async function freezeRankRowsForActivation() {
    const snap = await db.collection(COL_RANKS).where('active', '==', true).get();
    const rows = snap.docs.map((d) => {
        const x = d.data();
        const daily = Number(x.dailyReward ?? 0);
        const dur = Number(x.rewardDurationDays ?? x.durationDays ?? 0);
        const storedTotal = Number(x.totalReward ?? 0);
        const totalReward = storedTotal > 0 ? storedTotal : daily * dur;
        return {
            id: d.id,
            name: String(x.name ?? ''),
            requiredTeamBusiness: Number(x.requiredTeamBusiness ?? x.teamBiz ?? 0),
            dailyReward: daily,
            rewardDurationDays: dur,
            totalReward,
            sortOrder: Number(x.sortOrder ?? x.requiredTeamBusiness ?? 0),
        };
    });
    rows.sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.requiredTeamBusiness - b.requiredTeamBusiness));
    return rows;
}
/** Credits TB + power/rest volume to every uplines for rank qualification (50/50 split of incoming BV by default). */
async function propagateTeamBusinessVolume(beneficiaryUid, amount, powerPct, restPct) {
    if (amount <= 0)
        return;
    const { p, r } = normalizePowerRestPercent(powerPct, restPct);
    const pFrac = p / 100;
    const rFrac = r / 100;
    let cur = beneficiaryUid;
    for (;;) {
        const cs = await db.collection(COL_USERS).doc(cur).get();
        if (!cs.exists)
            break;
        const sponsor = cs.data()?.sponsorUid;
        if (!sponsor)
            break;
        await db.collection(COL_USERS).doc(sponsor).set({
            totalTeamBusiness: firestore_1.FieldValue.increment(amount),
            powerTeamBusiness: firestore_1.FieldValue.increment(amount * pFrac),
            restTeamBusiness: firestore_1.FieldValue.increment(amount * rFrac),
            updatedAt: Date.now(),
        }, { merge: true });
        cur = sponsor;
    }
}
/**
 * One-time direct sponsor bonus when a referred user activates.
 * Credited against the sponsor’s global working-income ceiling (Σ stake × 3).
 * Team level income is paid daily from downline ROI — see `distributeTeamLevelIncomeFromDailyRoi`.
 */
async function paySponsorBonusForActivation(activePackageId, beneficiaryUid, activationAmount, planSnap) {
    const sponsorPct = Number(planSnap.sponsorPercent ?? 5);
    const bene = await db.collection(COL_USERS).doc(beneficiaryUid).get();
    const sponsorUid = bene.exists ? bene.data()?.sponsorUid : undefined;
    let sponsorPaid = 0;
    if (!sponsorUid || !(await hasAtLeastOneActivePackage(sponsorUid))) {
        await db
            .collection(COL_ACTIVE)
            .doc(activePackageId)
            .set({ workingPaid: 0, sponsorPaidAtActivation: 0, updatedAt: Date.now() }, { merge: true });
        return;
    }
    const sRef = db.collection(COL_USERS).doc(sponsorUid);
    const sSnap = await sRef.get();
    if (!sSnap.exists || Boolean(sSnap.data()?.blocked)) {
        await db
            .collection(COL_ACTIVE)
            .doc(activePackageId)
            .set({ workingPaid: 0, sponsorPaidAtActivation: 0, updatedAt: Date.now() }, { merge: true });
        return;
    }
    const gross = (activationAmount * sponsorPct) / 100;
    const remaining = await userWorkingIncomeRemaining(sponsorUid);
    const payAmt = Math.min(gross, Math.max(0, remaining));
    if (payAmt > 1e-12) {
        await sRef.update({
            'wallets.cash': firestore_1.FieldValue.increment(payAmt),
            workingIncomeBalance: firestore_1.FieldValue.increment(payAmt),
            sponsorBonusTotal: firestore_1.FieldValue.increment(payAmt),
            'userTotals.totalWorkingIncome': firestore_1.FieldValue.increment(payAmt),
            updatedAt: Date.now(),
        });
        await db.collection('sponsorBonuses').add({
            userId: sponsorUid,
            fromUserId: beneficiaryUid,
            amount: payAmt,
            activePackageId,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        sponsorPaid = payAmt;
    }
    await db
        .collection(COL_ACTIVE)
        .doc(activePackageId)
        .set({
        workingPaid: sponsorPaid,
        workingIncomeEarned: sponsorPaid,
        sponsorPaidAtActivation: sponsorPaid,
        updatedAt: Date.now(),
    }, { merge: true });
}
/** Whole calendar days from package start (used with daily ROI cadence). */
function wholeDaysSincePackageStart(startedAt, now) {
    return Math.max(0, Math.floor((now.toMillis() - startedAt.toMillis()) / 86400000));
}
/** Cap % and max paying calendar days for this matrix row (null max = no day cap when plan duration unset). */
function teamLevelWindowCapMaxPayDays(row, planDurationDays) {
    const dur = Math.max(0, Math.floor(planDurationDays));
    const rawCap = row.uplineDurationCapPercent != null
        ? Number(row.uplineDurationCapPercent)
        : compensationDefaults_1.DEFAULT_UPLINE_DURATION_CAP_PERCENT;
    const capPct = Math.max(0, Math.min(100, Number.isFinite(rawCap) ? rawCap : compensationDefaults_1.DEFAULT_UPLINE_DURATION_CAP_PERCENT));
    if (dur <= 0)
        return { capPct, maxPayDays: null };
    const maxPayDays = Math.floor((dur * capPct) / 100);
    if (maxPayDays <= 0)
        return { capPct, maxPayDays: 0 };
    return { capPct, maxPayDays };
}
/**
 * When downline plan has a positive duration, upline earns this row only while
 * `elapsedDays < floor(durationDays × capPercent / 100)`. Missing cap on old snapshots uses
 * `DEFAULT_UPLINE_DURATION_CAP_PERCENT`.
 */
function teamLevelPayoutWithinDownlinePlanWindow(row, startedAt, now, planDurationDays) {
    const { maxPayDays } = teamLevelWindowCapMaxPayDays(row, planDurationDays);
    if (maxPayDays === null)
        return true;
    if (maxPayDays <= 0)
        return false;
    const elapsed = wholeDaysSincePackageStart(startedAt, now);
    return elapsed < maxPayDays;
}
/** Split of downline daily ROI to uplines — % × credited ROI; each pay min(gross, sponsor’s working room left). */
async function distributeTeamLevelIncomeFromDailyRoi(downlineActivePackageId, downlineUid, dailyRoiCredited, planSnap, payoutClock) {
    if (dailyRoiCredited <= 1e-12 || !planSnap)
        return;
    const teamFrozen = Array.isArray(planSnap.teamLevels) ? planSnap.teamLevels : [];
    const activeCache = new Map();
    const uplHasActive = async (uid) => {
        const k = String(uid ?? '').trim();
        if (!k)
            return false;
        if (activeCache.has(k))
            return activeCache.get(k);
        const ok = await hasAtLeastOneActivePackage(k);
        activeCache.set(k, ok);
        return ok;
    };
    let child = downlineUid;
    for (let depth = 0; depth < teamFrozen.length; depth++) {
        const row = teamFrozen[depth];
        const childSnap = await db.collection(COL_USERS).doc(child).get();
        if (!childSnap.exists)
            break;
        const upl = childSnap.data()?.sponsorUid;
        if (!upl)
            break;
        if (row && row.percent > 0) {
            if (!teamLevelPayoutWithinDownlinePlanWindow(row, payoutClock.startedAt, payoutClock.now, payoutClock.durationDays)) {
                child = upl;
                continue;
            }
            const uplRef = db.collection(COL_USERS).doc(upl);
            const uplSnap = await uplRef.get();
            if (uplSnap.exists && !Boolean(uplSnap.data()?.blocked) && (await uplHasActive(upl))) {
                const directs = Number(uplSnap.data()?.activeDirects ?? 0);
                if (directs >= row.requiredDirects) {
                    const gross = (dailyRoiCredited * row.percent) / 100;
                    const remaining = await userWorkingIncomeRemaining(upl);
                    const payAmt = Math.min(gross, Math.max(0, remaining));
                    if (payAmt > 1e-12) {
                        const { capPct, maxPayDays } = teamLevelWindowCapMaxPayDays(row, payoutClock.durationDays);
                        const durSnap = Math.max(0, Math.floor(payoutClock.durationDays));
                        await uplRef.update({
                            'wallets.cash': firestore_1.FieldValue.increment(payAmt),
                            workingIncomeBalance: firestore_1.FieldValue.increment(payAmt),
                            teamLevelCommissionTotal: firestore_1.FieldValue.increment(payAmt),
                            'userTotals.totalWorkingIncome': firestore_1.FieldValue.increment(payAmt),
                            updatedAt: Date.now(),
                        });
                        await db
                            .collection(COL_ACTIVE)
                            .doc(downlineActivePackageId)
                            .set({
                            workingPaid: firestore_1.FieldValue.increment(payAmt),
                            workingIncomeEarned: firestore_1.FieldValue.increment(payAmt),
                            updatedAt: Date.now(),
                        }, { merge: true });
                        await db.collection('teamLevelBonuses').add({
                            userId: upl,
                            fromUserId: downlineUid,
                            level: row.level,
                            amount: payAmt,
                            activePackageId: downlineActivePackageId,
                            sourceDailyRoi: dailyRoiCredited,
                            distribution: 'daily_roi_share',
                            /** Upline clients cannot read downline `activePackages`; denorm for dashboard “remaining days”. */
                            downlinePackageStartedAt: payoutClock.startedAt,
                            teamLevelWindowDurationDays: durSnap,
                            teamLevelWindowCapPercent: capPct,
                            teamLevelWindowMaxPayDays: maxPayDays,
                            ...(row.conditionDescription ? { conditionDescription: row.conditionDescription } : {}),
                            createdAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                    }
                }
            }
        }
        child = upl;
    }
}
function rankMilestoneQualifies(u, rank, powerPct, restPct) {
    const req = rank.requiredTeamBusiness;
    const tb = Number(u.totalTeamBusiness ?? 0);
    const pb = Number(u.powerTeamBusiness ?? 0);
    const rb = Number(u.restTeamBusiness ?? 0);
    if (tb < req)
        return false;
    if (pb + rb < 1e-9 && tb > 0)
        return tb >= req;
    const { p, r } = normalizePowerRestPercent(powerPct, restPct);
    return pb >= (req * p) / 100 && rb >= (req * r) / 100;
}
function pickNextSequentialRank(u, ranks, completed, powerPct, restPct) {
    for (const rank of ranks) {
        if (completed.has(rank.id))
            continue;
        return rankMilestoneQualifies(u, rank, powerPct, restPct) ? rank : null;
    }
    return null;
}
async function resolveRankPolicyForUser(uid, u) {
    void uid;
    const snap = u.rankCompensationSnapshot;
    const arr = snap?.ranks;
    if (Array.isArray(arr) && arr.length > 0) {
        const ranks = arr
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
            .sort((a, b) => a.sortOrder - b.sortOrder || a.requiredTeamBusiness - b.requiredTeamBusiness);
        const { p, r } = normalizePowerRestPercent(Number(snap?.rankQualificationPowerPercent ?? 50), Number(snap?.rankQualificationRestPercent ?? 50));
        return ranks.length ? { ranks, p, r } : null;
    }
    const live = await freezeRankRowsForActivation();
    if (live.length === 0)
        return null;
    const st = (await db.collection(COL_SETTINGS).doc('config').get()).data() ?? {};
    const { p, r } = normalizePowerRestPercent(Number(st.rankQualificationPowerPercent ?? 50), Number(st.rankQualificationRestPercent ?? 50));
    return { ranks: live, p, r };
}
async function finalizeRankSchedule(uid, rankId) {
    await db
        .collection(COL_USERS)
        .doc(uid)
        .set({
        rankRewardActive: false,
        rankRewardDaysPaid: 0,
        rankRewardTotalDays: 0,
        rankRewardDailyAmount: 0,
        rankRewardRankId: '',
        rankRewardRankName: '',
        rankRewardLastPaidDayKey: '',
        completedRankRewardIds: firestore_1.FieldValue.arrayUnion(rankId),
        updatedAt: Date.now(),
    }, { merge: true });
}
async function tryStartNextRankSchedule(uid) {
    const ref = db.collection(COL_USERS).doc(uid);
    const snap = await ref.get();
    if (!snap.exists)
        return;
    const u = snap.data();
    if (u.rankRewardActive === true)
        return;
    const policy = await resolveRankPolicyForUser(uid, u);
    if (!policy)
        return;
    const rawDone = u.completedRankRewardIds;
    const done = new Set(Array.isArray(rawDone) ? rawDone.map(String) : []);
    const next = pickNextSequentialRank(u, policy.ranks, done, policy.p, policy.r);
    if (!next || next.dailyReward <= 0 || next.rewardDurationDays <= 0)
        return;
    await ref.set({
        rankRewardActive: true,
        rankRewardDaysPaid: 0,
        rankRewardTotalDays: next.rewardDurationDays,
        rankRewardDailyAmount: next.dailyReward,
        rankRewardRankId: next.id,
        rankRewardRankName: next.name,
        rankRewardLastPaidDayKey: '',
        currentRank: next.name,
        updatedAt: Date.now(),
    }, { merge: true });
}
/** Team-level qualification: sponsor needs N directs that each maintain ≥1 active package. Bump when beneficiary had zero actives → first active after this txn. */
async function bumpSponsorActiveDirectWhenDirectGainsFirstActivePackage(memberUid) {
    const bene = await db.collection(COL_USERS).doc(memberUid).get();
    const sponsor = bene.data()?.sponsorUid;
    if (!sponsor)
        return;
    await db
        .collection(COL_USERS)
        .doc(sponsor)
        .set({ activeDirects: firestore_1.FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
}
/** When a member drops to zero active packages, decrement sponsor once (non-negative). */
async function maybeDecrementSponsorActiveDirectsWhenNoActivePackages(memberUid) {
    const remain = await db
        .collection(COL_ACTIVE)
        .where('userId', '==', memberUid)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    if (!remain.empty)
        return;
    const bene = await db.collection(COL_USERS).doc(memberUid).get();
    const sponsor = bene.data()?.sponsorUid;
    if (!sponsor)
        return;
    await db.runTransaction(async (tx) => {
        const sRef = db.collection(COL_USERS).doc(sponsor);
        const sSnap = await tx.get(sRef);
        const cur = Number(sSnap.data()?.activeDirects ?? 0);
        if (cur <= 0)
            return;
        tx.update(sRef, { activeDirects: cur - 1, updatedAt: Date.now() });
    });
}
async function bumpRankEligibilityAlongUpline(beneficiaryUid, maxHops = 500) {
    let cur = beneficiaryUid;
    for (let i = 0; i < maxHops; i++) {
        const cs = await db.collection(COL_USERS).doc(cur).get();
        if (!cs.exists)
            break;
        const sponsor = cs.data()?.sponsorUid;
        if (!sponsor)
            break;
        await tryStartNextRankSchedule(sponsor);
        cur = sponsor;
    }
}
async function processRankRewardForUser(uid, dayKey) {
    const ref = db.collection(COL_USERS).doc(uid);
    const snap = await ref.get();
    if (!snap.exists)
        return;
    const u = snap.data();
    if (u.rankRewardActive === true) {
        const lastKey = String(u.rankRewardLastPaidDayKey ?? '');
        if (lastKey === dayKey)
            return;
        if (!(await hasAtLeastOneActivePackage(uid))) {
            return;
        }
        if (Boolean(u.blocked)) {
            return;
        }
        if (await shouldBlockRankPayoutForWorkingCap(uid)) {
            return;
        }
        const daysPaid = Number(u.rankRewardDaysPaid ?? 0);
        const totalDays = Number(u.rankRewardTotalDays ?? 0);
        const rankId = String(u.rankRewardRankId ?? '');
        const daily = Number(u.rankRewardDailyAmount ?? 0);
        const rankName = String(u.rankRewardRankName ?? 'Rank');
        if (totalDays <= 0 || daily <= 0 || !rankId) {
            await ref.set({ rankRewardActive: false, updatedAt: Date.now() }, { merge: true });
            await tryStartNextRankSchedule(uid);
            return;
        }
        if (daysPaid >= totalDays) {
            await finalizeRankSchedule(uid, rankId);
            await tryStartNextRankSchedule(uid);
            return;
        }
        const workingRem = await userWorkingIncomeRemaining(uid);
        const payAmt = Math.min(daily, Math.max(0, workingRem));
        if (payAmt <= 1e-12) {
            return;
        }
        const nextDay = daysPaid + 1;
        const bonusId = `${uid}_${dayKey}_${rankId}_d${nextDay}`;
        const existed = await db.collection('rankBonuses').doc(bonusId).get();
        if (existed.exists)
            return;
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        await ref.update({
            'wallets.cash': firestore_1.FieldValue.increment(payAmt),
            rankCommissionTotal: firestore_1.FieldValue.increment(payAmt),
            workingIncomeBalance: firestore_1.FieldValue.increment(payAmt),
            'userTotals.totalWorkingIncome': firestore_1.FieldValue.increment(payAmt),
            rankRewardDaysPaid: nextDay,
            rankRewardLastPaidDayKey: dayKey,
            updatedAt: Date.now(),
        });
        if (nextDay >= totalDays) {
            await finalizeRankSchedule(uid, rankId);
            await tryStartNextRankSchedule(uid);
        }
        return;
    }
    await tryStartNextRankSchedule(uid);
}
function audit(actorUid, action, detail) {
    return db.collection('auditLogs').add({
        actorUid,
        action,
        detail,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
async function assertFirestoreAdmin(actorUid) {
    const snap = await db.collection(COL_USERS).doc(actorUid).get();
    if (!snap.exists || String(snap.data()?.role ?? '') !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Administrator only');
    }
}
function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}
exports.registerWithProfile = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    const data = request.data;
    if (!data.termsAccepted) {
        throw new https_1.HttpsError('invalid-argument', 'Terms must be accepted');
    }
    const email = String(data.email || '')
        .trim()
        .toLowerCase();
    const password = String(data.password || '');
    const fullName = String(data.fullName || '').trim();
    const phone = String(data.phone || '').trim().replace(/\s+/g, '');
    const sponsorUsername = data.sponsorUsername ? String(data.sponsorUsername).trim() : null;
    if (!email || !password || password.length < 8 || !fullName || phone.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid registration payload');
    }
    let sponsorUid = null;
    if (sponsorUsername) {
        const sRef = db.collection(COL_USERS_BY_UN).doc(sponsorUsername);
        const sSnap = await sRef.get();
        if (!sSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Sponsor ID does not exist');
        }
        sponsorUid = String(sSnap.data()?.uid || '');
    }
    const phoneRef = db.collection(COL_PHONE).doc(phone);
    const phoneSnap = await phoneRef.get();
    if (phoneSnap.exists) {
        throw new https_1.HttpsError('already-exists', 'Phone already registered');
    }
    const counterRef = db.collection(COL_COUNTERS).doc('usernames');
    const username = await db.runTransaction(async (tx) => {
        const cSnap = await tx.get(counterRef);
        const current = cSnap.exists ? Number(cSnap.data()?.current ?? USERNAME_START - 1) : USERNAME_START - 1;
        const next = current + 1;
        tx.set(counterRef, { current: next }, { merge: true });
        return String(next);
    });
    let userRecord;
    try {
        userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: fullName,
        });
    }
    catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
        if (code.includes('email-already-exists')) {
            throw new https_1.HttpsError('already-exists', 'Email already in use');
        }
        throw new https_1.HttpsError('internal', 'Could not create auth user');
    }
    const now = Date.now();
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
    };
    const batch = db.batch();
    batch.set(db.collection(COL_USERS).doc(userRecord.uid), userDoc);
    batch.set(db.collection(COL_USERS_BY_UN).doc(username), { uid: userRecord.uid, authEmail: email });
    batch.set(phoneRef, { uid: userRecord.uid });
    await batch.commit();
    /** `activeDirects` is maintained when a direct activates their first package / loses last active package. */
    return { username, uid: userRecord.uid };
});
function hashTransactionPin(uid, pin) {
    return (0, node_crypto_1.createHash)('sha256').update(`${uid}:${pin}`, 'utf8').digest('hex');
}
/** Authenticated members update display fields + USDT address; optional transaction PIN (stored hashed only). */
exports.updateMemberProfile = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const data = request.data;
    const fullName = String(data.fullName || '').trim();
    const phone = String(data.phone || '').trim().replace(/\s+/g, '');
    const city = String(data.city || '').trim();
    const usdtBep20Address = String(data.usdtBep20Address || '').trim();
    const transactionPasswordRaw = data.transactionPassword !== undefined && data.transactionPassword !== null
        ? String(data.transactionPassword)
        : '';
    if (fullName.length < 2)
        throw new https_1.HttpsError('invalid-argument', 'Enter your full name');
    if (phone.length < 8)
        throw new https_1.HttpsError('invalid-argument', 'Enter a valid mobile number');
    if (usdtBep20Address.length > 0 && !/^0x[a-fA-F0-9]{40}$/.test(usdtBep20Address)) {
        throw new https_1.HttpsError('invalid-argument', 'USDT address must be a valid 0x… BEP20 address');
    }
    if (transactionPasswordRaw.length > 0 && transactionPasswordRaw.length < 4) {
        throw new https_1.HttpsError('invalid-argument', 'Transaction password must be at least 4 characters');
    }
    const uRef = db.collection(COL_USERS).doc(uid);
    let phoneChanged = false;
    await db.runTransaction(async (tx) => {
        const uSnap = await tx.get(uRef);
        if (!uSnap.exists)
            throw new https_1.HttpsError('not-found', 'Profile not found');
        const oldPhone = String(uSnap.data()?.phone ?? '').trim();
        phoneChanged = oldPhone !== phone;
        let oldPhoneSnap = null;
        if (phoneChanged) {
            const newPhoneRef = db.collection(COL_PHONE).doc(phone);
            const newPhoneSnap = await tx.get(newPhoneRef);
            if (newPhoneSnap.exists && String(newPhoneSnap.data()?.uid ?? '') !== uid) {
                throw new https_1.HttpsError('already-exists', 'That mobile number is already registered');
            }
            if (oldPhone.length > 0) {
                oldPhoneSnap = await tx.get(db.collection(COL_PHONE).doc(oldPhone));
            }
        }
        const patch = {
            fullName,
            phone,
            city,
            usdtBep20Address,
            updatedAt: Date.now(),
        };
        if (transactionPasswordRaw.length > 0) {
            patch.transactionPinHash = hashTransactionPin(uid, transactionPasswordRaw);
        }
        tx.update(uRef, patch);
        if (phoneChanged) {
            tx.set(db.collection(COL_PHONE).doc(phone), { uid });
            if (oldPhone.length > 0 && oldPhoneSnap?.exists && String(oldPhoneSnap.data()?.uid ?? '') === uid) {
                tx.delete(db.collection(COL_PHONE).doc(oldPhone));
            }
        }
    });
    await admin.auth().updateUser(uid, { displayName: fullName });
    await audit(uid, 'updateMemberProfile', { phoneChanged });
    return { ok: true };
});
/** Set or update the transaction PIN (hashed). Requires current PIN when one is already set. */
exports.changeTransactionPassword = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const data = request.data;
    const currentRaw = data.currentPassword !== undefined && data.currentPassword !== null
        ? String(data.currentPassword)
        : '';
    const newRaw = data.newPassword !== undefined && data.newPassword !== null ? String(data.newPassword) : '';
    if (newRaw.length < 4) {
        throw new https_1.HttpsError('invalid-argument', 'New transaction password must be at least 4 characters');
    }
    const uRef = db.collection(COL_USERS).doc(uid);
    const uSnap = await uRef.get();
    if (!uSnap.exists)
        throw new https_1.HttpsError('not-found', 'Profile not found');
    const pinHash = uSnap.data()?.transactionPinHash;
    if (pinHash) {
        if (!currentRaw.trim()) {
            throw new https_1.HttpsError('failed-precondition', 'Enter your current transaction password');
        }
        if (hashTransactionPin(uid, currentRaw) !== pinHash) {
            throw new https_1.HttpsError('permission-denied', 'Invalid current transaction password');
        }
    }
    await uRef.update({
        transactionPinHash: hashTransactionPin(uid, newRaw),
        updatedAt: Date.now(),
    });
    await audit(uid, 'changeTransactionPassword', {});
    return { ok: true };
});
/** Users who list this account as sponsor (`sponsorUid`). */
exports.listDirectReferrals = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const sponsorUid = request.auth.uid;
    const snap = await db.collection(COL_USERS).where('sponsorUid', '==', sponsorUid).get();
    const referrals = [];
    for (const doc of snap.docs) {
        const d = doc.data();
        const childUid = doc.id;
        const apSnap = await db.collection(COL_ACTIVE).where('userId', '==', childUid).get();
        let amount = 0;
        apSnap.forEach((ap) => {
            if (String(ap.data()?.status ?? '') === 'active') {
                amount += Number(ap.data()?.amount ?? 0);
            }
        });
        referrals.push({
            username: String(d.username ?? ''),
            fullName: String(d.fullName ?? ''),
            phone: String(d.phone ?? ''),
            createdAt: Number(d.createdAt ?? 0),
            amount,
            volume: Number(d.totalTeamBusiness ?? 0),
        });
    }
    referrals.sort((a, b) => b.createdAt - a.createdAt);
    return { referrals };
});
/** Full downline tree under the caller (all depths). Level 1 = direct. Batched `in` queries (max 30). */
exports.listAllDownlines = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const rootUid = request.auth.uid;
    const depthMap = new Map();
    depthMap.set(rootUid, 0);
    let frontier = [rootUid];
    while (frontier.length > 0) {
        const nextFrontier = [];
        for (const part of chunkArray(frontier, 30)) {
            const snap = await db.collection(COL_USERS).where('sponsorUid', 'in', part).get();
            for (const doc of snap.docs) {
                const id = doc.id;
                if (depthMap.has(id))
                    continue;
                const sponsor = String(doc.data()?.sponsorUid ?? '');
                const lvl = (depthMap.get(sponsor) ?? 0) + 1;
                depthMap.set(id, lvl);
                nextFrontier.push(id);
            }
        }
        frontier = nextFrontier;
    }
    const memberUids = [...depthMap.keys()].filter((id) => id !== rootUid);
    if (memberUids.length === 0) {
        return { downlines: [] };
    }
    const packageSum = new Map();
    for (const uid of memberUids)
        packageSum.set(uid, 0);
    for (const part of chunkArray(memberUids, 30)) {
        const apSnap = await db.collection(COL_ACTIVE).where('userId', 'in', part).get();
        apSnap.forEach((ap) => {
            if (String(ap.data()?.status ?? '') !== 'active')
                return;
            const u = String(ap.data()?.userId ?? '');
            const amt = Number(ap.data()?.amount ?? 0);
            packageSum.set(u, (packageSum.get(u) ?? 0) + amt);
        });
    }
    const userData = new Map();
    for (const part of chunkArray(memberUids, 100)) {
        const snaps = await Promise.all(part.map((id) => db.collection(COL_USERS).doc(id).get()));
        snaps.forEach((s) => {
            if (s.exists)
                userData.set(s.id, s.data());
        });
    }
    const downlines = [];
    for (const id of memberUids) {
        const d = userData.get(id);
        if (!d)
            continue;
        downlines.push({
            username: String(d.username ?? ''),
            fullName: String(d.fullName ?? ''),
            createdAt: Number(d.createdAt ?? 0),
            sponsorUsername: d.sponsorUsername != null ? String(d.sponsorUsername) : '—',
            packageAmount: packageSum.get(id) ?? 0,
            level: depthMap.get(id) ?? 1,
        });
    }
    downlines.sort((a, b) => {
        if (a.level !== b.level)
            return a.level - b.level;
        if (a.createdAt !== b.createdAt)
            return a.createdAt - b.createdAt;
        return a.username.localeCompare(b.username);
    });
    await audit(rootUid, 'listAllDownlines', { count: downlines.length });
    return { downlines };
});
/** Ki-style topup: resolve username → display name for form hint */
exports.resolveUsername = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const raw = String(request.data?.username ?? '').trim().toLowerCase();
    if (!raw)
        return { fullName: '' };
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(raw).get();
    if (!mapSnap.exists)
        return { fullName: 'Invalid Id' };
    const bid = mapSnap.data().uid;
    const uSnap = await db.collection(COL_USERS).doc(bid).get();
    if (!uSnap.exists)
        return { fullName: 'Invalid Id' };
    const fn = String(uSnap.data().fullName ?? '').trim();
    return { fullName: fn || '—' };
});
/** Registration / invite links: resolve referral username → public display name (no sign-in required). */
exports.publicResolveReferrer = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    const raw = String(request.data?.username ?? '').trim();
    if (!raw || raw.length > 96) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid referral ID');
    }
    const key = raw.toLowerCase();
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get();
    if (!mapSnap.exists)
        return { found: false, fullName: '' };
    const bid = mapSnap.data().uid;
    const uSnap = await db.collection(COL_USERS).doc(bid).get();
    if (!uSnap.exists)
        return { found: false, fullName: '' };
    const fn = String(uSnap.data().fullName ?? '').trim();
    return { found: true, fullName: fn || '—' };
});
const LOGIN_SYNTHETIC_EMAIL_DOMAIN = 'richpay.local';
function isValidEmailForReset(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function resolveAuthEmailForUsername(username, mapData) {
    const alt = mapData?.authEmail;
    if (typeof alt === 'string') {
        const e = alt.trim().toLowerCase();
        if (isValidEmailForReset(e))
            return e;
    }
    return `${username.trim().toLowerCase()}@${LOGIN_SYNTHETIC_EMAIL_DOMAIN}`;
}
/** Firebase Identity Toolkit — sends the same template email as client `sendPasswordResetEmail`. */
async function sendPasswordResetOob(apiKey, signInEmail, continueUrl) {
    const key = apiKey.trim();
    if (key.length < 10) {
        throw new Error('Invalid or missing Firebase Web API key.');
    }
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`;
    const body = {
        requestType: 'PASSWORD_RESET',
        email: signInEmail,
    };
    const cu = continueUrl?.trim();
    if (cu)
        body.continueUrl = cu;
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const j = (await r.json());
    if (!r.ok) {
        const msg = j.error?.message ?? r.statusText;
        throw new Error(String(msg));
    }
}
/**
 * Public: user supplies numeric UserID + registered email. If they match Firestore / Auth mapping,
 * Firebase sends a password reset link to the **Auth sign-in email** (real email or synthetic @richpay.local).
 */
exports.requestPasswordReset = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    const data = request.data;
    const username = String(data.username ?? '').trim().toLowerCase();
    const emailInput = String(data.email ?? '').trim().toLowerCase();
    const webApiKey = process.env.FIREBASE_WEB_API_KEY?.trim() || String(data.firebaseWebApiKey ?? '').trim();
    if (!/^\d{4,12}$/.test(username)) {
        return { sent: false, message: 'Enter your numeric UserID (for example 9994549).' };
    }
    if (!isValidEmailForReset(emailInput)) {
        return { sent: false, message: 'Enter the email address registered on your account.' };
    }
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(username).get();
    if (!mapSnap.exists) {
        return { sent: false, message: 'UserID and email do not match our records.' };
    }
    const mapData = mapSnap.data();
    const uid = String(mapData?.uid ?? '');
    if (!uid) {
        return { sent: false, message: 'UserID and email do not match our records.' };
    }
    const userSnap = await db.collection(COL_USERS).doc(uid).get();
    if (!userSnap.exists) {
        return { sent: false, message: 'UserID and email do not match our records.' };
    }
    const uData = userSnap.data();
    const profileEmail = String(uData?.email ?? '').trim().toLowerCase();
    const mapAuthEmail = typeof mapData?.authEmail === 'string' ? String(mapData.authEmail).trim().toLowerCase() : '';
    const signInEmail = resolveAuthEmailForUsername(username, mapData);
    const emailOk = emailInput === profileEmail ||
        (mapAuthEmail.length > 0 && emailInput === mapAuthEmail) ||
        emailInput === signInEmail.toLowerCase();
    if (!emailOk) {
        return { sent: false, message: 'UserID and email do not match our records.' };
    }
    try {
        await admin.auth().getUser(uid);
    }
    catch {
        return { sent: false, message: 'Could not send a reset email for this account. Contact support.' };
    }
    const continueUrl = process.env.PASSWORD_RESET_CONTINUE_URL?.trim();
    try {
        await sendPasswordResetOob(webApiKey, signInEmail, continueUrl);
    }
    catch (e) {
        console.warn('[requestPasswordReset] sendOobCode failed', e);
        const detail = e instanceof Error ? e.message : String(e);
        return {
            sent: false,
            message: webApiKey.length < 10
                ? 'Password reset is not configured. Set VITE_FIREBASE_API_KEY in the app build, or set FIREBASE_WEB_API_KEY on Cloud Functions.'
                : `Could not send the reset email (${detail}). Try again or contact support.`,
        };
    }
    void audit(uid, 'requestPasswordReset', { username }).catch(() => { });
    return {
        sent: true,
        message: 'Password reset email sent. Check your inbox (and spam). Follow the link to choose a new password.',
    };
});
exports.activatePackage = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const data = request.data;
    const { packageId, amount, beneficiaryUsername, transactionPassword, planType } = data;
    if (!packageId || !amount || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid package selection');
    }
    const callerSnap = await db.collection(COL_USERS).doc(uid).get();
    if (!callerSnap.exists)
        throw new https_1.HttpsError('not-found', 'User missing');
    const caller = callerSnap.data();
    const callerUsername = String(caller.username ?? '').trim().toLowerCase();
    const pinHash = caller.transactionPinHash;
    const pinRaw = transactionPassword !== undefined && transactionPassword !== null ? String(transactionPassword) : '';
    if (pinHash) {
        if (pinRaw.length === 0) {
            throw new https_1.HttpsError('failed-precondition', 'Transaction password required');
        }
        if (hashTransactionPin(uid, pinRaw) !== pinHash) {
            throw new https_1.HttpsError('permission-denied', 'Invalid transaction password');
        }
    }
    const beneRaw = String(beneficiaryUsername ?? '').trim().toLowerCase();
    let beneficiaryUid = uid;
    const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get();
    const settings = settingsSnap.data() ?? {};
    const restrictTopupToDirects = enforcePackageTopupDirectReferralOnly(settings);
    if (beneRaw && beneRaw !== callerUsername) {
        const mapSnap = await db.collection(COL_USERS_BY_UN).doc(beneRaw).get();
        if (!mapSnap.exists)
            throw new https_1.HttpsError('not-found', 'Invalid UserID to Topup');
        beneficiaryUid = mapSnap.data().uid;
        const beneSnap = await db.collection(COL_USERS).doc(beneficiaryUid).get();
        if (!beneSnap.exists)
            throw new https_1.HttpsError('not-found', 'Member not found');
        if (restrictTopupToDirects) {
            const sponsorOfBene = beneSnap.data()?.sponsorUid;
            if (sponsorOfBene !== uid) {
                throw new https_1.HttpsError('permission-denied', 'You can only topup your direct referrals or yourself (or enable “Activation transfers: allow any member UserID” in Transfer settings to allow any UserID).');
            }
        }
    }
    const pkgSnap = await db.collection(COL_PACKAGES).doc(packageId).get();
    if (!pkgSnap.exists)
        throw new https_1.HttpsError('not-found', 'Package not found');
    const pkg = pkgSnap.data();
    if (!pkg.active)
        throw new https_1.HttpsError('failed-precondition', 'Package inactive');
    const minAmount = Number(pkg.minAmount ?? 0);
    const maxAmount = Number(pkg.maxAmount ?? 0);
    if (amount < minAmount || amount > maxAmount) {
        throw new https_1.HttpsError('invalid-argument', 'Amount out of range');
    }
    const splitDebit = splitTopupWalletDebit(amount);
    const callerWallets = caller.wallets;
    const depositBal = Number(callerWallets?.deposit ?? 0);
    const activationBalPre = Number(callerWallets?.activation ?? 0);
    if (activationBalPre < splitDebit.activation || depositBal < splitDebit.deposit) {
        throw new https_1.HttpsError('failed-precondition', `Package purchase splits 50/50: need $${splitDebit.activation.toFixed(2)} in Activation Wallet and $${splitDebit.deposit.toFixed(2)} in Deposit Wallet (total $${amount.toFixed(2)})`);
    }
    const teamDepth = Math.min(100, Math.max(1, Number(settings.teamLevelsCount ?? 30)));
    const sponsorPctFrozen = Number(settings.sponsorPercent ?? 5);
    const siteNwMult = Number(settings.nonWorkingIncomeCapMultiplier ?? 2);
    const siteWMult = Number(settings.workingIncomeCapMultiplier ?? 3);
    const frozenNonWorkingCapMultiplier = resolveNonWorkingCapMultiplierFromPackage(pkg, siteNwMult);
    const frozenWorkingCapMultiplier = resolveWorkingCapMultiplierFromPackage(pkg, siteWMult);
    const totalIncomeMult = frozenNonWorkingCapMultiplier + frozenWorkingCapMultiplier;
    const stopAllIncomeFrozen = settings.stopAllIncomeWhenWorkingCapReached === true;
    const minWithdrawFrozen = Number(settings.minWithdrawal ?? 10);
    const withdrawFeeFrozen = Number(settings.withdrawFeePercent ?? 10);
    const planSettingsVersion = Number(settings.planSettingsVersion ?? 0);
    const rkPowerIn = Number(settings.rankQualificationPowerPercent ?? 50);
    const rkRestIn = Number(settings.rankQualificationRestPercent ?? 50);
    const { p: rkPowerPct, r: rkRestPct } = normalizePowerRestPercent(rkPowerIn, rkRestIn);
    const roiPercent = Number(pkg.roiPercent ?? 0);
    const durationDays = Number(pkg.durationDays ?? 0);
    const planWantCompound = planType === 2;
    const pkgShelfRaw = String(pkg.packageShelf ?? 'investment').toLowerCase();
    const pkgShelf = pkgShelfRaw === 'compounding' ? 'compounding' : 'investment';
    if (planWantCompound && pkgShelf !== 'compounding') {
        throw new https_1.HttpsError('invalid-argument', 'Choose a Rich Compounding tier (Package Management → Compounding) when using Compounding plan type.');
    }
    if (!planWantCompound && pkgShelf === 'compounding') {
        throw new https_1.HttpsError('invalid-argument', 'This tier is Rich Compounding only — select Compounding plan type.');
    }
    const planLabel = planWantCompound ? 'compounding' : 'daily';
    const capturedAt = Date.now();
    const withdrawFrozen = freezeWithdrawPolicyFromSettings(settings);
    const teamLevelsFrozen = await freezeTeamLevelsForActivation(teamDepth);
    const ranksFrozen = await freezeRankRowsForActivation();
    const planSnapshot = {
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
    };
    const apRef = db.collection(COL_ACTIVE).doc();
    const preActiveForBene = await db
        .collection(COL_ACTIVE)
        .where('userId', '==', beneficiaryUid)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    const beneHadNoActivePackage = preActiveForBene.empty;
    await db.runTransaction(async (tx) => {
        const uRef = db.collection(COL_USERS).doc(uid);
        const uSnap = await tx.get(uRef);
        if (!uSnap.exists)
            throw new https_1.HttpsError('not-found', 'User missing');
        const wallets = uSnap.data()?.wallets;
        const act = Number(wallets?.activation ?? 0);
        const depW = Number(wallets?.deposit ?? 0);
        if (act < splitDebit.activation || depW < splitDebit.deposit) {
            throw new https_1.HttpsError('failed-precondition', 'Insufficient activation or deposit wallet for 50/50 split');
        }
        tx.update(uRef, {
            'wallets.activation': act - splitDebit.activation,
            'wallets.deposit': depW - splitDebit.deposit,
            updatedAt: Date.now(),
        });
        const now = firestore_1.Timestamp.now();
        const ends = firestore_1.Timestamp.fromMillis(now.toMillis() + durationDays * 86400000);
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
        });
    });
    await paySponsorBonusForActivation(apRef.id, beneficiaryUid, amount, planSnapshot);
    await propagateTeamBusinessVolume(beneficiaryUid, amount, rkPowerPct, rkRestPct);
    await db
        .collection(COL_USERS)
        .doc(beneficiaryUid)
        .set({
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
    }, { merge: true });
    if (beneHadNoActivePackage) {
        await bumpSponsorActiveDirectWhenDirectGainsFirstActivePackage(beneficiaryUid);
    }
    await bumpRankEligibilityAlongUpline(beneficiaryUid);
    await audit(uid, 'activatePackage', {
        packageId,
        amount,
        beneficiaryUid,
        planType: planLabel,
        planSettingsVersionAtCapture: planSettingsVersion,
        activePackageId: apRef.id,
    });
    return { activePackageId: apRef.id };
});
exports.createWithdrawal = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const data = request.data;
    const amount = Number(data.amount);
    const address = data.address != null ? String(data.address).trim() : '';
    const transactionPassword = data.transactionPassword !== undefined && data.transactionPassword !== null
        ? String(data.transactionPassword)
        : '';
    if (!amount || amount <= 0 || !address || address.length < 10) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid withdrawal');
    }
    const callerSnap = await db.collection(COL_USERS).doc(uid).get();
    if (!callerSnap.exists)
        throw new https_1.HttpsError('not-found', 'User missing');
    const caller = callerSnap.data();
    const pinHash = caller.transactionPinHash;
    if (pinHash) {
        if (!transactionPassword.trim()) {
            throw new https_1.HttpsError('failed-precondition', 'Transaction password required');
        }
        if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
            throw new https_1.HttpsError('permission-denied', 'Invalid transaction password');
        }
    }
    const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get();
    const liveSettings = settingsSnap.data() ?? {};
    const livePol = freezeWithdrawPolicyFromSettings(liveSettings);
    const frozen = caller.withdrawalPolicySnapshot;
    const policy = mergeWithdrawPolicyForUser(livePol, frozen);
    if (policy.withdrawalsEnabled === false) {
        throw new https_1.HttpsError('failed-precondition', 'Withdrawals are temporarily disabled');
    }
    if (!isWithinWithdrawalWindow(policy)) {
        throw new https_1.HttpsError('failed-precondition', 'Withdrawals are only allowed during the published time window.');
    }
    const minW = Number(policy.minWithdrawal ?? 10);
    const feePct = Number(policy.withdrawFeePercent ?? 10);
    if (amount < minW) {
        throw new https_1.HttpsError('invalid-argument', `Minimum withdrawal ${minW}`);
    }
    const amountStep = Math.max(1, Math.floor(Number(policy.withdrawalAmountStep ?? 10)));
    if (!isWithdrawalAmountStepValid(amount, amountStep)) {
        throw new https_1.HttpsError('invalid-argument', `Withdrawal amount must be a multiple of ${amountStep} USDT (e.g. ${amountStep}, ${amountStep * 2}, ${amountStep * 3}).`);
    }
    const cooldownH = Math.max(0, Number(policy.withdrawalCooldownHours ?? 78));
    if (cooldownH > 0) {
        const lastMs = await lastNonRejectedWithdrawalCreatedMs(uid);
        if (lastMs != null) {
            const elapsed = Date.now() - lastMs;
            const windowMs = cooldownH * 3600000;
            if (elapsed < windowMs) {
                const nextAt = new Date(lastMs + windowMs).toISOString();
                const waitH = Math.ceil((windowMs - elapsed) / 3600000);
                throw new https_1.HttpsError('failed-precondition', `You can submit the next withdrawal in about ${waitH} hour(s) (after ${nextAt}).`);
            }
        }
    }
    const maxPrincipal = await maxActivePrincipalForUser(uid);
    if (policy.withdrawalRequiresActivePackage !== false) {
        if (maxPrincipal <= 0) {
            throw new https_1.HttpsError('failed-precondition', 'An active package is required to withdraw.');
        }
        const cap = computeMaxWithdrawalForPrincipal(maxPrincipal, policy);
        if (amount > cap + 1e-6) {
            throw new https_1.HttpsError('invalid-argument', `Amount exceeds the maximum allowed for your active package (${cap.toFixed(2)} USDT).`);
        }
    }
    const fee = (amount * feePct) / 100;
    const net = amount - fee;
    const wRef = db.collection(COL_WITHDRAWALS).doc();
    await db.runTransaction(async (tx) => {
        const uRef = db.collection(COL_USERS).doc(uid);
        const uSnap = await tx.get(uRef);
        const cash = Number(uSnap.data()?.wallets?.cash ?? 0);
        if (cash < amount)
            throw new https_1.HttpsError('failed-precondition', 'Insufficient cash');
        tx.update(uRef, {
            'wallets.cash': cash - amount,
            totalWithdrawn: firestore_1.FieldValue.increment(amount),
            updatedAt: Date.now(),
        });
        tx.set(wRef, {
            userId: uid,
            amountGross: amount,
            fee,
            amountNet: net,
            address,
            status: 'pending',
            policySnapshot: policy,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    await audit(uid, 'createWithdrawal', { amount, address });
    return { withdrawalId: wRef.id };
});
exports.walletConvert = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const { from, to, amount } = request.data;
    if (!from || !to || !amount || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid conversion');
    }
    const allowed = (from === 'deposit' && to === 'activation') || (from === 'activation' && to === 'cash');
    if (!allowed) {
        throw new https_1.HttpsError('failed-precondition', 'Conversion path not permitted');
    }
    if (from === 'deposit' && to === 'activation') {
        const cfgSnap = await db.collection(COL_SETTINGS).doc('config').get();
        if (cfgSnap.exists && cfgSnap.data()?.depositToActivationConvertEnabled === false) {
            throw new https_1.HttpsError('failed-precondition', 'Deposit → Activation conversion is disabled');
        }
    }
    await db.runTransaction(async (tx) => {
        const uRef = db.collection(COL_USERS).doc(uid);
        const uSnap = await tx.get(uRef);
        const wallets = uSnap.data()?.wallets;
        const a = Number(wallets?.[from] ?? 0);
        if (a < amount)
            throw new https_1.HttpsError('failed-precondition', 'Insufficient balance');
        tx.update(uRef, {
            [`wallets.${from}`]: a - amount,
            [`wallets.${to}`]: Number(wallets?.[to] ?? 0) + amount,
            updatedAt: Date.now(),
        });
    });
    await audit(uid, 'walletConvert', { from, to, amount });
});
/**
 * Move USDT from caller’s cash (income) wallet to a member’s activation wallet — Ki “Convert” form.
 * Beneficiary must be the caller or a direct referral. Requires transaction PIN when set on profile.
 */
exports.convertIncomeToActivation = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const data = request.data;
    const amount = Number(data.amount);
    const beneRaw = String(data.beneficiaryUsername ?? '').trim().toLowerCase();
    const transactionPassword = data.transactionPassword !== undefined ? String(data.transactionPassword) : '';
    if (!beneRaw || !amount || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Enter UserID and a valid amount');
    }
    const callerSnap = await db.collection(COL_USERS).doc(uid).get();
    if (!callerSnap.exists)
        throw new https_1.HttpsError('not-found', 'User missing');
    const caller = callerSnap.data();
    const callerUsername = String(caller.username ?? '').trim().toLowerCase();
    const pinHash = caller.transactionPinHash;
    if (pinHash) {
        if (!transactionPassword.trim()) {
            throw new https_1.HttpsError('failed-precondition', 'Transaction password required');
        }
        if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
            throw new https_1.HttpsError('permission-denied', 'Invalid transaction password');
        }
    }
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(beneRaw).get();
    if (!mapSnap.exists)
        throw new https_1.HttpsError('not-found', 'Invalid UserID');
    const beneficiaryUid = mapSnap.data().uid;
    if (beneRaw !== callerUsername) {
        const beneSnap = await db.collection(COL_USERS).doc(beneficiaryUid).get();
        if (!beneSnap.exists)
            throw new https_1.HttpsError('not-found', 'Member not found');
        const sponsorOfBene = beneSnap.data()?.sponsorUid;
        if (sponsorOfBene !== uid) {
            throw new https_1.HttpsError('permission-denied', 'You can only convert for yourself or your direct referrals');
        }
    }
    await db.runTransaction(async (tx) => {
        const callerRef = db.collection(COL_USERS).doc(uid);
        const beneRef = db.collection(COL_USERS).doc(beneficiaryUid);
        const cSnap = await tx.get(callerRef);
        const bSnap = await tx.get(beneRef);
        if (!cSnap.exists || !bSnap.exists)
            throw new https_1.HttpsError('not-found', 'User missing');
        const cash = Number(cSnap.data()?.wallets?.cash ?? 0);
        if (cash < amount)
            throw new https_1.HttpsError('failed-precondition', 'Insufficient income (cash) balance');
        const cWallets = cSnap.data()?.wallets;
        const bWallets = bSnap.data()?.wallets;
        if (beneficiaryUid === uid) {
            tx.update(callerRef, {
                'wallets.cash': cash - amount,
                'wallets.activation': Number(cWallets?.activation ?? 0) + amount,
                updatedAt: Date.now(),
            });
        }
        else {
            tx.update(callerRef, {
                'wallets.cash': cash - amount,
                updatedAt: Date.now(),
            });
            tx.update(beneRef, {
                'wallets.activation': Number(bWallets?.activation ?? 0) + amount,
                updatedAt: Date.now(),
            });
        }
    });
    await audit(uid, 'convertIncomeToActivation', { amount, beneficiaryUid, beneficiaryUsername: beneRaw });
});
/**
 * Peer transfer: caller’s activation wallet → recipient’s activation wallet (Ki Transfer form).
 * Recipient must exist. Unless `siteSettings.config.allowActivationTransferToAnyUser` is true,
 * recipient must be a direct referral (sponsorUid === caller). Not self.
 */
exports.internalTransfer = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const uid = request.auth.uid;
    const data = request.data;
    const amount = Number(data.amount);
    const recipRaw = String(data.recipientUsername ?? '').trim().toLowerCase();
    const transactionPassword = data.transactionPassword !== undefined ? String(data.transactionPassword) : '';
    if (!recipRaw || !amount || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Enter recipient UserID and amount');
    }
    const callerSnap = await db.collection(COL_USERS).doc(uid).get();
    if (!callerSnap.exists)
        throw new https_1.HttpsError('not-found', 'User missing');
    const caller = callerSnap.data();
    const callerUsername = String(caller.username ?? '').trim().toLowerCase();
    const pinHash = caller.transactionPinHash;
    if (pinHash) {
        if (!transactionPassword.trim()) {
            throw new https_1.HttpsError('failed-precondition', 'Transaction password required');
        }
        if (hashTransactionPin(uid, transactionPassword) !== pinHash) {
            throw new https_1.HttpsError('permission-denied', 'Invalid transaction password');
        }
    }
    if (recipRaw === callerUsername) {
        throw new https_1.HttpsError('invalid-argument', 'Choose a team member UserID to transfer to');
    }
    const mapSnap = await db.collection(COL_USERS_BY_UN).doc(recipRaw).get();
    if (!mapSnap.exists)
        throw new https_1.HttpsError('not-found', 'Invalid UserID');
    const recipientUid = mapSnap.data().uid;
    const beneSnap = await db.collection(COL_USERS).doc(recipientUid).get();
    if (!beneSnap.exists)
        throw new https_1.HttpsError('not-found', 'Member not found');
    const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get();
    const transferToAnyMember = Boolean(settingsSnap.data()?.allowActivationTransferToAnyUser);
    if (!transferToAnyMember) {
        const sponsorOfRecip = beneSnap.data()?.sponsorUid;
        if (sponsorOfRecip !== uid) {
            throw new https_1.HttpsError('permission-denied', 'You can only transfer to your direct referrals');
        }
    }
    const transferRef = db.collection(COL_INTERNAL).doc();
    await db.runTransaction(async (tx) => {
        const senderRef = db.collection(COL_USERS).doc(uid);
        const recipRef = db.collection(COL_USERS).doc(recipientUid);
        const sSnap = await tx.get(senderRef);
        const rSnap = await tx.get(recipRef);
        if (!sSnap.exists || !rSnap.exists)
            throw new https_1.HttpsError('not-found', 'User missing');
        const sAct = Number(sSnap.data()?.wallets?.activation ?? 0);
        if (sAct < amount)
            throw new https_1.HttpsError('failed-precondition', 'Insufficient activation wallet');
        const rAct = Number(rSnap.data()?.wallets?.activation ?? 0);
        tx.update(senderRef, {
            'wallets.activation': sAct - amount,
            updatedAt: Date.now(),
        });
        tx.update(recipRef, {
            'wallets.activation': rAct + amount,
            updatedAt: Date.now(),
        });
        tx.set(transferRef, {
            userId: uid,
            recipientUid,
            amount,
            fromWallet: 'activation',
            toWallet: 'activation',
            fromUsername: callerUsername,
            toUsername: recipRaw,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    await audit(uid, 'internalTransfer', { amount, recipientUid, recipientUsername: recipRaw });
});
/**
 * Approve / reject (refund) / mark paid withdrawals. Reject only from `pending` refunds cash + totalWithdrawn.
 */
exports.adminWithdrawalUpdate = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const data = request.data;
    const withdrawalId = String(data.withdrawalId || '').trim();
    const next = data.next;
    const txHash = data.txHash != null ? String(data.txHash).trim() : '';
    if (!withdrawalId || !next) {
        throw new https_1.HttpsError('invalid-argument', 'withdrawalId and next are required');
    }
    const ref = db.collection(COL_WITHDRAWALS).doc(withdrawalId);
    const mailbox = [];
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Withdrawal not found');
        const d = snap.data();
        const cur = String(d.status || '');
        const uid = String(d.userId);
        const gross = Number(d.amountGross ?? 0);
        if (next === 'rejected') {
            if (cur !== 'pending' && cur !== 'processing') {
                throw new https_1.HttpsError('failed-precondition', 'Only pending or processing withdrawals can be rejected');
            }
            tx.update(ref, {
                status: 'rejected',
                reviewedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: Date.now(),
            });
            tx.update(db.collection(COL_USERS).doc(uid), {
                'wallets.cash': firestore_1.FieldValue.increment(gross),
                totalWithdrawn: firestore_1.FieldValue.increment(-gross),
                updatedAt: Date.now(),
            });
            mailbox.push({
                userId: uid,
                title: 'Withdrawal rejected',
                body: `${gross} USDT was returned to your cash wallet.`,
            });
            return;
        }
        if (next === 'processing') {
            if (cur === 'processing') {
                throw new https_1.HttpsError('failed-precondition', 'Withdrawal is already processing');
            }
            if (cur !== 'pending' && cur !== 'approved') {
                throw new https_1.HttpsError('failed-precondition', 'Only pending or approved withdrawals can be marked processing');
            }
            tx.update(ref, {
                status: 'processing',
                processingAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: Date.now(),
            });
            mailbox.push({
                userId: uid,
                title: 'Withdrawal processing',
                body: 'Your withdrawal is being processed for payout.',
            });
            return;
        }
        if (next === 'approved') {
            if (cur !== 'pending' && cur !== 'processing') {
                throw new https_1.HttpsError('failed-precondition', 'Only pending or processing withdrawals can be approved');
            }
            tx.update(ref, {
                status: 'approved',
                reviewedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: Date.now(),
            });
            mailbox.push({
                userId: uid,
                title: 'Withdrawal approved',
                body: 'Your withdrawal is approved and will be processed for payout.',
            });
            return;
        }
        if (next === 'paid') {
            if (cur !== 'pending' && cur !== 'approved' && cur !== 'processing') {
                throw new https_1.HttpsError('failed-precondition', 'Withdrawal must be pending, approved, or processing');
            }
            const resolvedTx = txHash.length > 0 ? txHash : 'PENDING_CONFIRMATION';
            tx.update(ref, {
                status: 'paid',
                txId: resolvedTx,
                paidAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: Date.now(),
            });
            mailbox.push({
                userId: uid,
                title: 'Withdrawal paid',
                body: `Marked paid. TX/reference: ${resolvedTx}`,
            });
            return;
        }
        throw new https_1.HttpsError('invalid-argument', 'Invalid next status');
    });
    const note = mailbox[0];
    if (note) {
        await db.collection('notifications').add({
            userId: note.userId,
            title: note.title,
            body: note.body,
            read: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await audit(actorUid, 'adminWithdrawalUpdate', { withdrawalId, next });
    return { ok: true };
});
/**
 * Admin approves/rejects a deposit. Approval credits `wallets.deposit` in the same transaction as the status flip
 * (fixes missed credits when only Firestore was updated from the console or an older client).
 * Idempotent: repeats do not double-credit when `walletCreditApplied` is already true.
 */
exports.adminFinalizeDeposit = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const data = request.data;
    const depositId = String(data.depositId ?? '').trim();
    const decision = String(data.decision ?? '').trim().toLowerCase();
    const rawNote = data.adminNote != null ? String(data.adminNote).trim() : '';
    const notePatch = rawNote.length > 0 ? { adminNote: rawNote } : {};
    if (!depositId) {
        throw new https_1.HttpsError('invalid-argument', 'depositId is required');
    }
    if (decision !== 'approved' && decision !== 'rejected') {
        throw new https_1.HttpsError('invalid-argument', 'decision must be approved or rejected');
    }
    const depRef = db.collection(COL_DEPOSITS).doc(depositId);
    if (decision === 'rejected') {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(depRef);
            if (!snap.exists)
                throw new https_1.HttpsError('not-found', 'Deposit not found');
            const d = snap.data();
            const cur = String(d.status ?? '')
                .trim()
                .toLowerCase();
            if (cur !== 'pending') {
                throw new https_1.HttpsError('failed-precondition', 'Only pending deposits can be rejected');
            }
            tx.update(depRef, {
                status: 'rejected',
                reviewedAt: firestore_1.FieldValue.serverTimestamp(),
                ...notePatch,
            });
        });
        await audit(actorUid, 'adminDepositRejected', { depositId });
        return { ok: true, credited: 0 };
    }
    let notifyUserId = '';
    const creditedAmount = await db.runTransaction(async (tx) => {
        const snap = await tx.get(depRef);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Deposit not found');
        const d = snap.data();
        const cur = String(d.status ?? '')
            .trim()
            .toLowerCase();
        const alreadyCredited = d.walletCreditApplied === true;
        if (alreadyCredited && cur === 'approved') {
            return 0;
        }
        const amount = Number(d.amount ?? 0);
        const userId = String(d.userId ?? '').trim();
        if (!userId || !Number.isFinite(amount) || amount <= 0) {
            throw new https_1.HttpsError('failed-precondition', 'Invalid deposit amount or member id');
        }
        notifyUserId = userId;
        const userRef = db.collection(COL_USERS).doc(userId);
        if (cur === 'pending' && alreadyCredited) {
            tx.update(depRef, {
                status: 'approved',
                reviewedAt: firestore_1.FieldValue.serverTimestamp(),
                walletCreditApplied: true,
                walletCreditAppliedAt: firestore_1.FieldValue.serverTimestamp(),
                ...notePatch,
            });
            return 0;
        }
        if (!alreadyCredited) {
            tx.update(userRef, {
                'wallets.deposit': firestore_1.FieldValue.increment(amount),
                updatedAt: Date.now(),
            });
        }
        if (cur === 'pending') {
            tx.update(depRef, {
                status: 'approved',
                reviewedAt: firestore_1.FieldValue.serverTimestamp(),
                walletCreditApplied: true,
                walletCreditAppliedAt: firestore_1.FieldValue.serverTimestamp(),
                ...notePatch,
            });
            return alreadyCredited ? 0 : amount;
        }
        if (cur === 'approved') {
            tx.update(depRef, {
                walletCreditApplied: true,
                walletCreditAppliedAt: firestore_1.FieldValue.serverTimestamp(),
                ...notePatch,
            });
            return alreadyCredited ? 0 : amount;
        }
        throw new https_1.HttpsError('failed-precondition', 'Deposit cannot be approved — not pending nor an approved row missing wallet credit.');
    });
    if (creditedAmount > 0 && notifyUserId) {
        await db.collection('notifications').add({
            userId: notifyUserId,
            title: 'Deposit approved',
            body: `${creditedAmount} USDT credited to your deposit wallet`,
            read: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await audit(actorUid, 'adminFinalizeDeposit', { depositId, decision, creditedAmount });
    return { ok: true, credited: creditedAmount };
});
const WALLET_SHADOW_KEYS = ['deposit', 'activation', 'cash'];
/**
 * Old `set(..., { merge: true })` with dotted keys like `wallets.deposit` created stray top-level fields
 * literally named `wallets.deposit` while the nested map `wallets.deposit` stayed at 0 — the app reads
 * nested `wallets.*` only, so balances appeared empty. This merges each shadow into nested `wallets.*`
 * and deletes the shadow segment. Idempotent for already-clean docs.
 */
exports.adminRepairWalletShadowFields = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const userId = String(request.data?.userId ?? '').trim();
    if (!userId)
        throw new https_1.HttpsError('invalid-argument', 'userId is required');
    const ref = db.collection(COL_USERS).doc(userId);
    const merged = [];
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'User not found');
        const pairs = [];
        for (const w of WALLET_SHADOW_KEYS) {
            const ghost = snap.get(new firestore_1.FieldPath(`wallets.${w}`));
            if (typeof ghost !== 'number' || !Number.isFinite(ghost) || ghost === 0)
                continue;
            const nested = snap.get(new firestore_1.FieldPath('wallets', w));
            const n = typeof nested === 'number' && Number.isFinite(nested) ? nested : Number(nested ?? 0) || 0;
            pairs.push([new firestore_1.FieldPath('wallets', w), n + ghost]);
            pairs.push([new firestore_1.FieldPath(`wallets.${w}`), firestore_1.FieldValue.delete()]);
            merged.push(w);
        }
        if (pairs.length === 0)
            return;
        pairs.push(['updatedAt', Date.now()]);
        const flat = pairs.flat();
        tx.update(ref, ...flat);
    });
    await audit(actorUid, 'adminRepairWalletShadowFields', { userId, mergedLeaves: merged });
    return { ok: true, repaired: merged.length > 0, mergedLeaves: merged };
});
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
];
function adminAdjustBalanceFirestorePath(field) {
    switch (field) {
        case 'wallet_deposit':
            return 'wallets.deposit';
        case 'wallet_activation':
            return 'wallets.activation';
        case 'wallet_cash':
            return 'wallets.cash';
        case 'nonWorkingIncomeBalance':
            return 'nonWorkingIncomeBalance';
        case 'workingIncomeBalance':
            return 'workingIncomeBalance';
        case 'userTotals_totalWorkingIncome':
            return 'userTotals.totalWorkingIncome';
        case 'sponsorBonusTotal':
            return 'sponsorBonusTotal';
        case 'dailyProfitsTotal':
            return 'dailyProfitsTotal';
        case 'teamLevelCommissionTotal':
            return 'teamLevelCommissionTotal';
        case 'rankCommissionTotal':
            return 'rankCommissionTotal';
        default: {
            const _exhaustive = field;
            throw new Error(`Unhandled balance field: ${String(_exhaustive)}`);
        }
    }
}
function readAdminAdjustableBalance(snap, field) {
    const d = snap.data();
    if (!d)
        return 0;
    switch (field) {
        case 'wallet_deposit':
            return Number(d.wallets?.deposit ?? 0);
        case 'wallet_activation':
            return Number(d.wallets?.activation ?? 0);
        case 'wallet_cash':
            return Number(d.wallets?.cash ?? 0);
        case 'nonWorkingIncomeBalance':
            return Number(d.nonWorkingIncomeBalance ?? 0);
        case 'workingIncomeBalance':
            return Number(d.workingIncomeBalance ?? 0);
        case 'userTotals_totalWorkingIncome':
            return Number(d.userTotals?.totalWorkingIncome ?? 0);
        case 'sponsorBonusTotal':
            return Number(d.sponsorBonusTotal ?? 0);
        case 'dailyProfitsTotal':
            return Number(d.dailyProfitsTotal ?? 0);
        case 'teamLevelCommissionTotal':
            return Number(d.teamLevelCommissionTotal ?? 0);
        case 'rankCommissionTotal':
            return Number(d.rankCommissionTotal ?? 0);
        default: {
            const _exhaustive = field;
            void _exhaustive;
            return 0;
        }
    }
}
/**
 * Admin-only: apply a signed delta to one numeric balance field on a member (`users/{userId}`).
 * Prevents resulting values below zero. Audited.
 */
exports.adminAdjustMemberBalances = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const data = request.data;
    const userId = String(data.userId ?? '').trim();
    const fieldRaw = String(data.field ?? '').trim();
    const delta = Number(data.delta);
    if (!userId)
        throw new https_1.HttpsError('invalid-argument', 'userId is required');
    if (!ADMIN_ADJUST_BALANCE_FIELDS.includes(fieldRaw)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid balance field');
    }
    const field = fieldRaw;
    if (!Number.isFinite(delta) || delta === 0) {
        throw new https_1.HttpsError('invalid-argument', 'delta must be a non-zero finite number');
    }
    if (Math.abs(delta) > 1e12) {
        throw new https_1.HttpsError('invalid-argument', 'delta out of allowed range');
    }
    const ref = db.collection(COL_USERS).doc(userId);
    const path = adminAdjustBalanceFirestorePath(field);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'User not found');
        const cur = readAdminAdjustableBalance(snap, field);
        if (cur + delta < -1e-9) {
            throw new https_1.HttpsError('failed-precondition', 'Adjustment would make balance negative');
        }
        tx.update(ref, {
            [path]: firestore_1.FieldValue.increment(delta),
            updatedAt: Date.now(),
        });
    });
    await audit(actorUid, 'adminAdjustMemberBalances', { userId, field, delta });
    return { ok: true };
});
/**
 * Permanently remove a member: `users/{uid}`, `usersByUsername/{username}`, matching `phoneIndex`,
 * and Firebase Auth user. Cannot delete yourself or an account that still has `role: admin`.
 */
exports.adminDeleteMember = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const targetUid = String(request.data?.userId ?? '').trim();
    if (!targetUid)
        throw new https_1.HttpsError('invalid-argument', 'userId is required');
    if (targetUid === actorUid) {
        throw new https_1.HttpsError('permission-denied', 'You cannot delete your own administrator account');
    }
    const uRef = db.collection(COL_USERS).doc(targetUid);
    const uSnap = await uRef.get();
    if (!uSnap.exists)
        throw new https_1.HttpsError('not-found', 'User not found');
    const d = uSnap.data();
    if (String(d.role ?? '') === 'admin') {
        throw new https_1.HttpsError('failed-precondition', 'Change this user’s role from Admin to Member before deleting the account');
    }
    const username = String(d.username ?? '').trim();
    const phone = String(d.phone ?? '').trim().replace(/\s+/g, '');
    const batch = db.batch();
    batch.delete(uRef);
    if (username) {
        const mapRef = db.collection(COL_USERS_BY_UN).doc(username);
        const mapSnap = await mapRef.get();
        if (mapSnap.exists && String(mapSnap.data()?.uid ?? '') === targetUid) {
            batch.delete(mapRef);
        }
    }
    if (phone.length >= 8) {
        const phoneRef = db.collection(COL_PHONE).doc(phone);
        const phoneSnap = await phoneRef.get();
        if (phoneSnap.exists && String(phoneSnap.data()?.uid ?? '') === targetUid) {
            batch.delete(phoneRef);
        }
    }
    await batch.commit();
    try {
        await admin.auth().deleteUser(targetUid);
    }
    catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
        if (!code.includes('user-not-found')) {
            throw new https_1.HttpsError('internal', 'Firestore data removed but Firebase Auth delete failed — check Auth console');
        }
    }
    await audit(actorUid, 'adminDeleteMember', { deletedUid: targetUid, username, phone: phone || undefined });
    return { ok: true };
});
/** Push the same notification document to every user (batched). */
exports.adminBroadcastNotification = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const data = request.data;
    const title = String(data.title || '').trim();
    const body = String(data.body || '').trim();
    if (!title || !body) {
        throw new https_1.HttpsError('invalid-argument', 'Title and body required');
    }
    const snap = await db.collection(COL_USERS).get();
    let total = 0;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        for (const d of docs.slice(i, i + 400)) {
            const ref = db.collection('notifications').doc();
            batch.set(ref, {
                userId: d.id,
                title,
                body,
                read: false,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            total++;
        }
        await batch.commit();
    }
    await audit(actorUid, 'adminBroadcastNotification', { total, title });
    return { sent: total };
});
/** Writes reference compensation rows only when their doc id is missing (safe to run multiple times). */
exports.adminSeedCompensationDefaults = (0, https_1.onCall)(callableRuntimeOpts, async (request) => {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required');
    const actorUid = request.auth.uid;
    await assertFirestoreAdmin(actorUid);
    const data = request.data;
    const seedTeamLevels = data?.seedTeamLevels !== false;
    const seedRanks = data?.seedRanks !== false;
    const seedCompoundPlans = data?.seedCompoundPlans === true;
    const seedWithdrawDefaults = data?.seedWithdrawDefaults === true;
    let teamLevelsInserted = 0;
    let ranksInserted = 0;
    let compoundPlansInserted = 0;
    if (seedTeamLevels) {
        for (const row of compensationDefaults_1.REFERENCE_TEAM_LEVEL_SEED) {
            const ref = db.collection(COL_TEAM_LEVELS).doc(row.id);
            const ex = await ref.get();
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
                });
                teamLevelsInserted++;
            }
        }
    }
    if (seedRanks) {
        for (const row of compensationDefaults_1.REFERENCE_RANK_SEED) {
            const ref = db.collection(COL_RANKS).doc(row.id);
            const ex = await ref.get();
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
                });
                ranksInserted++;
            }
        }
    }
    if (seedCompoundPlans) {
        for (const row of compoundingDefaults_1.REFERENCE_COMPOUNDING_PLANS) {
            const ref = db.collection(COL_PACKAGES).doc(row.id);
            const ex = await ref.get();
            if (!ex.exists) {
                const roi = (0, compoundingDefaults_1.compoundRoiPercentForDoubleInDays)(row.durationDays);
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
                });
                compoundPlansInserted++;
            }
        }
    }
    const cfgRef = db.collection(COL_SETTINGS).doc('config');
    const cfgSnap = await cfgRef.get();
    const c = cfgSnap.data() ?? {};
    const ratioPatch = {};
    if (c.rankQualificationPowerPercent == null)
        ratioPatch.rankQualificationPowerPercent = 50;
    if (c.rankQualificationRestPercent == null)
        ratioPatch.rankQualificationRestPercent = 50;
    let withdrawDefaultsApplied = false;
    if (seedWithdrawDefaults) {
        const withdrawSeed = {};
        if (!Array.isArray(c.withdrawPackageCaps) || c.withdrawPackageCaps.length === 0) {
            withdrawSeed.withdrawPackageCaps = REFERENCE_WITHDRAW_PACKAGE_CAPS_SEED.map((row) => ({ ...row }));
        }
        if (c.minWithdrawal == null)
            withdrawSeed.minWithdrawal = 10;
        if (c.withdrawFeePercent == null)
            withdrawSeed.withdrawFeePercent = 10;
        if (c.withdrawalsEnabled === undefined)
            withdrawSeed.withdrawalsEnabled = true;
        if (c.withdrawNetworkLabel == null)
            withdrawSeed.withdrawNetworkLabel = 'USDT BEP-20';
        if (c.withdrawalWindowStart == null)
            withdrawSeed.withdrawalWindowStart = '10:30';
        if (c.withdrawalWindowEnd == null)
            withdrawSeed.withdrawalWindowEnd = '13:30';
        if (c.withdrawalWindowTimezone == null)
            withdrawSeed.withdrawalWindowTimezone = 'Etc/UTC';
        if (c.withdrawalRequiresActivePackage === undefined)
            withdrawSeed.withdrawalRequiresActivePackage = true;
        if (c.withdrawalProcessingIntervalHours == null)
            withdrawSeed.withdrawalProcessingIntervalHours = 48;
        if (c.withdrawalProcessingMode == null)
            withdrawSeed.withdrawalProcessingMode = 'manual';
        if (c.withdrawalCooldownHours == null)
            withdrawSeed.withdrawalCooldownHours = 78;
        if (c.withdrawalAmountStep == null)
            withdrawSeed.withdrawalAmountStep = 10;
        if (c.defaultWithdrawalPercentOfPackage == null)
            withdrawSeed.defaultWithdrawalPercentOfPackage = 20;
        if (Object.keys(withdrawSeed).length > 0) {
            withdrawDefaultsApplied = true;
            await cfgRef.set({
                ...withdrawSeed,
                withdrawPoliciesVersion: firestore_1.FieldValue.increment(1),
                updatedAt: Date.now(),
            }, { merge: true });
        }
    }
    if (Object.keys(ratioPatch).length > 0) {
        await cfgRef.set({ ...ratioPatch, updatedAt: Date.now() }, { merge: true });
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
    });
    return {
        ok: true,
        teamLevelsInserted,
        ranksInserted,
        compoundPlansInserted,
        withdrawDefaultsApplied,
    };
});
/** Sunday (IST) — no daily ROI or team-level share from that run. */
function isSundayIst(now = new Date()) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now);
    return wd === 'Sunday';
}
/** Daily ROI accrual at 00:00 India Standard Time (Asia/Kolkata, UTC+5:30). */
exports.processDailyRoi = (0, scheduler_1.onSchedule)({
    schedule: '0 0 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
}, async () => {
    const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get();
    if (settingsSnap.exists && settingsSnap.data()?.roiEnabled === false) {
        return;
    }
    if (isSundayIst()) {
        return;
    }
    const now = firestore_1.Timestamp.now();
    const snap = await db.collection(COL_ACTIVE).where('status', '==', 'active').get();
    for (const docSnap of snap.docs) {
        const ap = docSnap.data();
        const endsAt = ap.endsAt;
        const userIdEarly = String(ap.userId ?? '');
        if (endsAt.toMillis() < now.toMillis()) {
            await docSnap.ref.set({ status: 'completed', updatedAt: now }, { merge: true });
            if (userIdEarly)
                await maybeDecrementSponsorActiveDirectsWhenNoActivePackages(userIdEarly);
            continue;
        }
        /** Admin can pause daily ROI for a specific active package (member retains other plans). */
        if (ap.adminRoiPaused === true) {
            continue;
        }
        const amount = Number(ap.amount ?? 0);
        const planSnap = (ap.planSnapshot ?? null);
        const userId = userIdEarly;
        const userRow = await db.collection(COL_USERS).doc(userId).get();
        if (!userRow.exists || Boolean(userRow.data()?.blocked)) {
            continue;
        }
        if (await shouldSkipRoiForPackageOwner(userId, planSnap)) {
            continue;
        }
        const roiPercent = Number((planSnap && planSnap.roiPercent != null ? planSnap.roiPercent : null) ?? ap.roiPercent ?? 0);
        const nonWorkingPaid = Number(ap.nonWorkingPaid ?? 0);
        const nwMult = Number(ap.frozenNonWorkingCapMultiplier ??
            planSnap?.nonWorkingIncomeCapMultiplier ??
            2);
        const cap = amount * Math.max(nwMult, 0);
        const headroom = Math.max(0, cap - nonWorkingPaid);
        /** NW bucket full — stay `active` so sponsor/team income can continue until plan ends or working cap is hit. */
        if (headroom <= 1e-12) {
            continue;
        }
        const planTypeStr = String((planSnap && planSnap.planType != null ? planSnap.planType : null) ?? ap.planType ?? 'daily').toLowerCase();
        const compound = planTypeStr === 'compounding';
        const bal = compound ? Number(ap.compoundingBalance ?? amount) : amount;
        const rawDaily = (bal * roiPercent) / 100;
        const daily = Math.min(rawDaily, headroom);
        if (daily <= 1e-12) {
            continue;
        }
        const newPaid = nonWorkingPaid + daily;
        const hitCap = newPaid >= cap - 1e-9;
        const patch = { nonWorkingPaid: newPaid, updatedAt: now };
        if (compound)
            patch.compoundingBalance = bal + daily;
        if (hitCap) {
            patch.nonWorkingRoiSaturated = true;
        }
        await docSnap.ref.update(patch);
        await db.collection(COL_USERS).doc(userId).update({
            'wallets.cash': firestore_1.FieldValue.increment(daily),
            dailyProfitsTotal: firestore_1.FieldValue.increment(daily),
            nonWorkingIncomeBalance: firestore_1.FieldValue.increment(daily),
            updatedAt: Date.now(),
        });
        await db.collection(COL_DAILY).add({
            userId,
            amount: daily,
            activePackageId: docSnap.id,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const startedAt = ap.startedAt;
        const durationDays = Number((planSnap && planSnap.durationDays != null ? planSnap.durationDays : null) ?? ap.durationDays ?? 0);
        await distributeTeamLevelIncomeFromDailyRoi(docSnap.id, userId, daily, planSnap, {
            startedAt,
            now,
            durationDays,
        });
    }
});
/**
 * Scheduled ranking bonus drip: each user with an active rank payout schedule gets at most one
 * credit per UTC day; milestones and ratios use `rankCompensationSnapshot` when present.
 */
exports.processDailyRankRewards = (0, scheduler_1.onSchedule)({
    schedule: '30 3 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
}, async () => {
    const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get();
    if (settingsSnap.exists && settingsSnap.data()?.rankRewardsEnabled === false) {
        return;
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    let last;
    const pageSize = 400;
    for (;;) {
        let q = db.collection(COL_USERS).orderBy(firestore_1.FieldPath.documentId()).limit(pageSize);
        if (last)
            q = q.startAfter(last);
        const page = await q.get();
        if (page.empty)
            break;
        for (const docSnap of page.docs) {
            await processRankRewardForUser(docSnap.id, dayKey);
        }
        last = page.docs[page.docs.length - 1];
        if (page.size < pageSize)
            break;
    }
});
/** When withdrawal processing mode is auto, completes approved rows on the configured cadence (~48h). */
exports.processAutoWithdrawals = (0, scheduler_1.onSchedule)({
    schedule: '15 */6 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 300,
}, async () => {
    const cfgRef = db.collection(COL_SETTINGS).doc('config');
    const settingsSnap = await cfgRef.get();
    const st = settingsSnap.data() ?? {};
    if (String(st.withdrawalProcessingMode ?? 'manual').toLowerCase() !== 'auto')
        return;
    if (st.withdrawalsEnabled === false)
        return;
    const hrs = Math.min(336, Math.max(1, Number(st.withdrawalProcessingIntervalHours ?? 48)));
    const last = Number(st.lastAutoWithdrawalRunAt ?? 0);
    if (Date.now() - last < hrs * 3600000 - 60000)
        return;
    const q = await db.collection(COL_WITHDRAWALS).where('status', '==', 'approved').get();
    for (const d of q.docs) {
        await d.ref.set({
            status: 'paid',
            txId: 'AUTO_PENDING_TX',
            autoMarkedPaid: true,
            paidAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: Date.now(),
        }, { merge: true });
        const row = d.data();
        await db.collection('notifications').add({
            userId: String(row.userId ?? ''),
            title: 'Withdrawal completed',
            body: 'Your withdrawal was processed by the automated payout cycle. Reference: AUTO_PENDING_TX',
            read: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await cfgRef.set({ lastAutoWithdrawalRunAt: Date.now() }, { merge: true });
});
//# sourceMappingURL=index.js.map