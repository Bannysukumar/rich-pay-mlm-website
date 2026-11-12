/**
 * Detailed audit: why sponsor/direct-referral income may be missing for a member.
 *
 * Usage:
 *   node scripts/audit-direct-sponsor-income.mjs <service-account.json> <username-or-uid>
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const [keyPath, rawId] = process.argv.slice(2)
if (!keyPath || !rawId) {
  console.error('Usage: node scripts/audit-direct-sponsor-income.mjs <service-account.json> <username-or-uid>')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const ms = (v) => {
  if (v == null) return null
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v === 'number') return v
  return null
}
const iso = (v) => {
  const t = ms(v)
  return t == null ? null : new Date(t).toISOString()
}

async function resolveUid(identifier) {
  const key = String(identifier).trim().toLowerCase()
  const mapSnap = await db.collection('usersByUsername').doc(key).get()
  if (mapSnap.exists && mapSnap.data()?.uid) return String(mapSnap.data().uid)
  const direct = await db.collection('users').doc(String(identifier).trim()).get()
  if (direct.exists) return direct.id
  const q = await db.collection('users').where('username', '==', String(identifier).trim()).limit(1).get()
  if (!q.empty) return q.docs[0].id
  throw new Error(`User not found for "${identifier}"`)
}

async function hasActivePackage(uid) {
  const snap = await db.collection('activePackages').where('userId', '==', uid).where('status', '==', 'active').limit(1).get()
  return !snap.empty
}

async function main() {
  const uid = await resolveUid(rawId)
  const uSnap = await db.collection('users').doc(uid).get()
  const u = uSnap.data() ?? {}
  const settings = (await db.collection('settings').doc('config').get()).data() ?? {}
  const defaultSponsorPct = Number(settings.sponsorPercent ?? 5)

  const stakeSnap = await db.collection('activePackages').where('userId', '==', uid).get()
  let stakeActive = 0
  let stakeAll = 0
  const sponsorPkgs = []
  for (const d of stakeSnap.docs) {
    const x = d.data()
    const amt = Number(x.amount ?? 0)
    stakeAll += amt
    if (String(x.status) === 'active') stakeActive += amt
    sponsorPkgs.push({
      id: d.id,
      status: x.status,
      amount: amt,
      startedAt: iso(x.startedAt),
      endsAt: iso(x.endsAt),
    })
  }

  const workingPaid =
    Number(u.sponsorBonusTotal ?? 0) +
    Number(u.teamLevelCommissionTotal ?? 0) +
    Number(u.rankCommissionTotal ?? 0)
  const workingCap = stakeActive * Number(settings.workingIncomeCapMultiplier ?? 3)
  const totalIncome =
    Number(u.dailyProfitsTotal ?? 0) + workingPaid
  const totalCap = stakeActive * Number(settings.workingIncomeCapMultiplier ?? 3) // same 3x total in live rules often
  // Live CF uses separate NW 2x + total 3x; working room uses total 3x leftover after all income.
  const totalCapMult = Number(settings.workingIncomeCapMultiplier ?? 3)
  const totalCapAmt = stakeActive * totalCapMult
  const workingRoom = Math.max(0, totalCapAmt - totalIncome)

  console.log('\n=== SPONSOR (who should receive direct income) ===')
  console.log({
    uid,
    username: u.username,
    blocked: Boolean(u.blocked),
    activeDirects_field: u.activeDirects,
    sponsorBonusTotal: r2(u.sponsorBonusTotal),
    teamLevelCommissionTotal: r2(u.teamLevelCommissionTotal),
    rankCommissionTotal: r2(u.rankCommissionTotal),
    dailyProfitsTotal: r2(u.dailyProfitsTotal),
    cash: r2(u.wallets?.cash),
    workingIncomeBalance: r2(u.workingIncomeBalance),
    stakeActive: r2(stakeActive),
    stakeAll: r2(stakeAll),
    totalIncomeSoFar: r2(totalIncome),
    totalCap_3x_activeStake: r2(totalCapAmt),
    workingRoomLeft_approx: r2(workingRoom),
    hasActivePackage_now: await hasActivePackage(uid),
    defaultSponsorPercent: defaultSponsorPct,
    sponsorPackages: sponsorPkgs,
  })

  // Ledger of sponsor bonuses already paid TO this user
  const bonusSnap = await db.collection('sponsorBonuses').where('userId', '==', uid).get()
  const bonuses = bonusSnap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      fromUserId: x.fromUserId,
      amount: r2(x.amount),
      activePackageId: x.activePackageId,
      createdAt: iso(x.createdAt),
    }
  })
  bonuses.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const ledgerSum = bonuses.reduce((s, b) => s + Number(b.amount || 0), 0)

  console.log('\n=== SPONSOR BONUS LEDGER (paid TO this user) ===')
  console.log({
    count: bonuses.length,
    ledgerSum: r2(ledgerSum),
    userField_sponsorBonusTotal: r2(u.sponsorBonusTotal),
    mismatch: Math.abs(ledgerSum - Number(u.sponsorBonusTotal ?? 0)) > 0.02,
  })
  console.table(bonuses)

  // Direct referrals: users who have this uid as sponsorUid
  const directsSnap = await db.collection('users').where('sponsorUid', '==', uid).get()
  console.log(`\n=== DIRECT REFERRALS (sponsorUid == ${uid}) count=${directsSnap.size} ===`)

  const findings = []
  let expectedIfPaidAll = 0
  let actuallyPaid = 0
  let missingGross = 0

  for (const d of directsSnap.docs) {
    const du = d.data()
    const downUid = d.id
    const pkgs = await db.collection('activePackages').where('userId', '==', downUid).get()
    const pkgRows = []
    for (const p of pkgs.docs) {
      const x = p.data()
      const amount = Number(x.amount ?? 0)
      const planSnap = x.planSnapshot && typeof x.planSnapshot === 'object' ? x.planSnapshot : {}
      const pct = Number(planSnap.sponsorPercent ?? defaultSponsorPct)
      const gross = (amount * pct) / 100
      const paidMarked = Number(x.sponsorPaidAtActivation ?? NaN)
      const matchingBonuses = bonuses.filter((b) => b.activePackageId === p.id || b.fromUserId === downUid)
      const paidInLedger = matchingBonuses
        .filter((b) => b.activePackageId === p.id)
        .reduce((s, b) => s + Number(b.amount || 0), 0)

      let reason = 'OK_PAID'
      if (!(await hasActivePackage(uid)) && paidInLedger <= 0 && !(paidMarked > 0)) {
        // historical — check at audit time only informative
      }
      if (paidInLedger > 0.01 || paidMarked > 0.01) {
        reason = paidInLedger + 0.01 < gross - 0.01 ? 'PARTIAL_OR_CAPPED' : 'OK_PAID'
      } else if (!du.sponsorUid || du.sponsorUid !== uid) {
        reason = 'NOT_LINKED_TO_SPONSOR'
      } else if (amount <= 0) {
        reason = 'ZERO_AMOUNT'
      } else if (pct <= 0) {
        reason = 'SPONSOR_PERCENT_ZERO'
      } else if (Boolean(u.blocked)) {
        reason = 'SPONSOR_BLOCKED'
      } else if (paidMarked === 0 || paidMarked === 0.0) {
        reason = 'MARKED_ZERO_at_activation_(sponsor_inactive_or_blocked_or_no_room)'
      } else if (Number.isNaN(paidMarked)) {
        reason = 'NO_sponsorPaidAtActivation_field_(legacy/import?)'
      } else {
        reason = 'MISSING_BONUS_LEDGER'
      }

      expectedIfPaidAll += gross
      actuallyPaid += paidInLedger > 0 ? paidInLedger : paidMarked > 0 ? paidMarked : 0
      if (reason !== 'OK_PAID') missingGross += Math.max(0, gross - (paidInLedger || paidMarked || 0))

      pkgRows.push({
        packageId: p.id,
        status: x.status,
        amount: r2(amount),
        sponsorPercent: pct,
        expectedGross: r2(gross),
        sponsorPaidAtActivation: Number.isFinite(paidMarked) ? r2(paidMarked) : null,
        paidInLedgerForPkg: r2(paidInLedger),
        startedAt: iso(x.startedAt),
        reason,
      })
      findings.push({
        downlineUsername: du.username,
        downlineUid: downUid,
        ...pkgRows[pkgRows.length - 1],
      })
    }

    console.log({
      username: du.username,
      uid: downUid,
      blocked: Boolean(du.blocked),
      sponsorUid: du.sponsorUid,
      packageCount: pkgs.size,
      packages: pkgRows,
    })
  }

  // Also catch ledger rows from users who may no longer have sponsorUid (reparented)
  const fromIds = new Set(bonuses.map((b) => b.fromUserId).filter(Boolean))
  const directIds = new Set(directsSnap.docs.map((d) => d.id))
  const orphans = [...fromIds].filter((id) => !directIds.has(id))
  if (orphans.length) {
    console.log('\n=== BONUSES FROM USERS NOT CURRENTLY LISTED AS DIRECTS ===')
    for (const oid of orphans) {
      const ou = (await db.collection('users').doc(oid).get()).data()
      console.log({
        fromUserId: oid,
        username: ou?.username,
        currentSponsorUid: ou?.sponsorUid,
        bonuses: bonuses.filter((b) => b.fromUserId === oid),
      })
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log({
    directCount: directsSnap.size,
    packagesExamined: findings.length,
    expectedIfFullSponsorPct: r2(expectedIfPaidAll),
    actuallyPaidApprox: r2(actuallyPaid),
    ledgerSum: r2(ledgerSum),
    userField: r2(u.sponsorBonusTotal),
    missingGrossApprox: r2(missingGross),
  })

  const byReason = {}
  for (const f of findings) {
    byReason[f.reason] = (byReason[f.reason] ?? 0) + 1
  }
  console.log('\n=== BY REASON ===')
  console.table(Object.entries(byReason).map(([reason, count]) => ({ reason, count })))

  const problems = findings.filter((f) => f.reason !== 'OK_PAID')
  console.log('\n=== PROBLEM PACKAGES (detail) ===')
  console.table(
    problems.map((f) => ({
      downline: f.downlineUsername,
      pkg: f.packageId.slice(0, 8),
      amount: f.amount,
      expected: f.expectedGross,
      markedPaid: f.sponsorPaidAtActivation,
      ledger: f.paidInLedgerForPkg,
      reason: f.reason,
      started: f.startedAt?.slice(0, 10),
    })),
  )

  // Extra: was sponsor active around each problem activation? Check if sponsor had any package overlapping start
  console.log('\n=== SPONSOR ACTIVE-AT-ACTIVATION CHECK (problem pkgs) ===')
  for (const f of problems.slice(0, 40)) {
    const startMs = f.startedAt ? Date.parse(f.startedAt) : null
    let sponsorHadActiveThen = null
    if (startMs) {
      // Any of sponsor's packages started before this and (endsAt after or still active / completed after)
      sponsorHadActiveThen = sponsorPkgs.some((sp) => {
        const s = sp.startedAt ? Date.parse(sp.startedAt) : null
        const e = sp.endsAt ? Date.parse(sp.endsAt) : null
        if (s == null) return false
        if (s > startMs + 60000) return false // started after activation
        if (e != null && e < startMs - 60000) return false // already ended
        return true
      })
    }
    console.log({
      downline: f.downlineUsername,
      packageId: f.packageId,
      startedAt: f.startedAt,
      sponsorHadOverlappingPackage: sponsorHadActiveThen,
      reason: f.reason,
      expectedGross: f.expectedGross,
      sponsorPaidAtActivation: f.sponsorPaidAtActivation,
      paidInLedgerForPkg: f.paidInLedgerForPkg,
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
