/**
 * Reverse mistaken daily ROI + team-level payouts for one calendar day in Asia/Kolkata (IST).
 * Use when the scheduler ran on a configured holiday (e.g. Sunday).
 *
 * Reverses:
 *   - users: wallets.cash, dailyProfitsTotal, nonWorkingIncomeBalance (daily ROI)
 *   - users: wallets.cash, workingIncomeBalance, teamLevelCommissionTotal, userTotals.totalWorkingIncome (team)
 *   - activePackages: nonWorkingPaid, compoundingBalance, nonWorkingRoiSaturated; workingPaid, workingIncomeEarned
 * Deletes: dailyProfits + teamLevelBonuses rows for that IST day.
 *
 * Usage:
 *   node scripts/reverse-ist-holiday-payouts.mjs <service-account.json>
 *   node scripts/reverse-ist-holiday-payouts.mjs <service-account.json> --date=2026-05-18
 *   node scripts/reverse-ist-holiday-payouts.mjs <service-account.json> --execute
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const COL_USERS = 'users'
const COL_ACTIVE = 'activePackages'
const COL_DAILY = 'dailyProfits'
const COL_TEAM = 'teamLevelBonuses'
const IST = 'Asia/Kolkata'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const EXECUTE = process.argv.includes('--execute')
const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length)
const [keyPath] = args

if (!keyPath || process.argv.includes('-h')) {
  console.error(
    'Usage: node scripts/reverse-ist-holiday-payouts.mjs <service-account.json> [--date=YYYY-MM-DD] [--execute]',
  )
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const { FieldValue, Timestamp } = admin.firestore

/** YYYY-MM-DD in IST for `when` (default: now). */
function istDayKey(when = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    when,
  )
}

function istWeekdayLong(when = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'long' }).format(when)
}

/** UTC millis for 00:00:00.000 and 24h window on `dayKey` (YYYY-MM-DD) in IST. */
function istDayBounds(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 5.5 * 3600000
  const endMs = startMs + 86400000
  return {
    dayKey,
    startMs,
    endMs,
    start: Timestamp.fromMillis(startMs),
    end: Timestamp.fromMillis(endMs),
  }
}

function docCreatedMs(data) {
  const c = data.createdAt
  if (c != null && typeof c.toMillis === 'function') return c.toMillis()
  if (typeof c === 'number' && Number.isFinite(c)) return c
  return 0
}

async function loadPayoutsForIstDay(bounds) {
  const dailySnap = await db
    .collection(COL_DAILY)
    .where('createdAt', '>=', bounds.start)
    .where('createdAt', '<', bounds.end)
    .get()

  const teamSnap = await db
    .collection(COL_TEAM)
    .where('createdAt', '>=', bounds.start)
    .where('createdAt', '<', bounds.end)
    .get()

  const daily = dailySnap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      ref: d.ref,
      userId: String(x.userId ?? ''),
      amount: Number(x.amount ?? 0),
      activePackageId: String(x.activePackageId ?? ''),
      ms: docCreatedMs(x),
    }
  })

  const team = teamSnap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      ref: d.ref,
      userId: String(x.userId ?? ''),
      fromUserId: String(x.fromUserId ?? ''),
      amount: Number(x.amount ?? 0),
      activePackageId: String(x.activePackageId ?? ''),
      ms: docCreatedMs(x),
    }
  })

  return { daily, team }
}

function addAgg(map, key, field, delta) {
  if (!key) return
  if (!map.has(key)) map.set(key, {})
  const row = map.get(key)
  row[field] = (row[field] ?? 0) + delta
}

async function main() {
  const dayKey = dateArg?.trim() || istDayKey(new Date())
  const bounds = istDayBounds(dayKey)
  const weekday = istWeekdayLong(new Date(bounds.startMs + 3600000))

  console.log(
    JSON.stringify(
      {
        istDay: dayKey,
        istWeekday: weekday,
        windowUtc: {
          from: new Date(bounds.startMs).toISOString(),
          to: new Date(bounds.endMs).toISOString(),
        },
        execute: EXECUTE,
      },
      null,
      2,
    ),
  )

  const { daily, team } = await loadPayoutsForIstDay(bounds)

  if (daily.length === 0 && team.length === 0) {
    console.log('No dailyProfits or teamLevelBonuses found for this IST day. Nothing to reverse.')
    return
  }

  const userDebit = new Map()
  const pkgDebit = new Map()

  let dailyTotal = 0
  for (const row of daily) {
    if (row.amount <= 0 || !row.userId) continue
    dailyTotal += row.amount
    addAgg(userDebit, row.userId, 'cash', -row.amount)
    addAgg(userDebit, row.userId, 'dailyProfitsTotal', -row.amount)
    addAgg(userDebit, row.userId, 'nonWorkingIncomeBalance', -row.amount)
    if (row.activePackageId) {
      addAgg(pkgDebit, row.activePackageId, 'nonWorkingPaid', -row.amount)
      addAgg(pkgDebit, row.activePackageId, '_dailyRoiAmount', row.amount)
    }
  }

  let teamTotal = 0
  for (const row of team) {
    if (row.amount <= 0 || !row.userId) continue
    teamTotal += row.amount
    addAgg(userDebit, row.userId, 'cash', -row.amount)
    addAgg(userDebit, row.userId, 'workingIncomeBalance', -row.amount)
    addAgg(userDebit, row.userId, 'teamLevelCommissionTotal', -row.amount)
    addAgg(userDebit, row.userId, 'totalWorkingIncome', -row.amount)
    if (row.activePackageId) {
      addAgg(pkgDebit, row.activePackageId, 'workingPaid', -row.amount)
      addAgg(pkgDebit, row.activePackageId, 'workingIncomeEarned', -row.amount)
    }
  }

  const summary = {
    dailyProfitRows: daily.length,
    teamLevelRows: team.length,
    dailyAmountSum: dailyTotal,
    teamAmountSum: teamTotal,
    usersToAdjust: userDebit.size,
    activePackagesToAdjust: pkgDebit.size,
    sampleDaily: daily.slice(0, 3),
    sampleTeam: team.slice(0, 3),
  }
  console.log('\nPlanned reversal:\n', JSON.stringify(summary, null, 2))

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to apply debits and delete ledger rows.')
    return
  }

  const BATCH = 400
  let batch = db.batch()
  let ops = 0
  const flush = async () => {
    if (ops === 0) return
    await batch.commit()
    batch = db.batch()
    ops = 0
  }
  const push = async (ref, data) => {
    batch.update(ref, data)
    ops++
    if (ops >= BATCH) await flush()
  }

  for (const [uid, agg] of userDebit) {
    const patch = { updatedAt: Date.now() }
    if (agg.cash) patch['wallets.cash'] = FieldValue.increment(agg.cash)
    if (agg.dailyProfitsTotal) patch.dailyProfitsTotal = FieldValue.increment(agg.dailyProfitsTotal)
    if (agg.nonWorkingIncomeBalance) patch.nonWorkingIncomeBalance = FieldValue.increment(agg.nonWorkingIncomeBalance)
    if (agg.workingIncomeBalance) patch.workingIncomeBalance = FieldValue.increment(agg.workingIncomeBalance)
    if (agg.teamLevelCommissionTotal) patch.teamLevelCommissionTotal = FieldValue.increment(agg.teamLevelCommissionTotal)
    if (agg.totalWorkingIncome) patch['userTotals.totalWorkingIncome'] = FieldValue.increment(agg.totalWorkingIncome)
    await push(db.collection(COL_USERS).doc(uid), patch)
  }

  for (const [pkgId, agg] of pkgDebit) {
    const ref = db.collection(COL_ACTIVE).doc(pkgId)
    const snap = await ref.get()
    if (!snap.exists) continue
    const ap = snap.data()
    const ps = ap.planSnapshot
    const patch = { updatedAt: Date.now() }
    if (agg.nonWorkingPaid) {
      const amount = Number(ap.amount ?? 0)
      const nwMult = Number(
        ap.frozenNonWorkingCapMultiplier ??
          (ps && typeof ps === 'object' && ps.nonWorkingIncomeCapMultiplier != null
            ? Number(ps.nonWorkingIncomeCapMultiplier)
            : 2),
      )
      const cap = amount * Math.max(nwMult, 0)
      const newPaid = Number(ap.nonWorkingPaid ?? 0) + agg.nonWorkingPaid
      patch.nonWorkingPaid = FieldValue.increment(agg.nonWorkingPaid)
      if (newPaid < cap - 1e-6 && ap.nonWorkingRoiSaturated === true) {
        patch.nonWorkingRoiSaturated = FieldValue.delete()
      }
    }
    const planType = String(
      ap.planType ?? (ps && typeof ps === 'object' ? ps.planType : null) ?? 'daily',
    ).toLowerCase()
    const dailyRev = agg._dailyRoiAmount
    if (planType === 'compounding' && dailyRev && dailyRev > 0) {
      patch.compoundingBalance = FieldValue.increment(-dailyRev)
    }
    if (agg.workingPaid) patch.workingPaid = FieldValue.increment(agg.workingPaid)
    if (agg.workingIncomeEarned) patch.workingIncomeEarned = FieldValue.increment(agg.workingIncomeEarned)
    await push(ref, patch)
  }

  await flush()

  batch = db.batch()
  ops = 0
  for (const row of [...daily, ...team]) {
    batch.delete(row.ref)
    ops++
    if (ops >= BATCH) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  await flush()

  console.log('\nDone. Reversed wallets/packages and deleted payout ledger rows for IST day', dayKey)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
