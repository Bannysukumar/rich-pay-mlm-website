/**
 * Credit lump-sum daily ROI for remaining compounding plan days, then mark package completed.
 *
 * For each member (by username / UserID), finds compounding activePackages and:
 *   1. Simulates daily ROI from now until endsAt (same formula as processDailyRoi)
 *   2. Skips Sundays (IST) like the live cron
 *   3. Credits wallets.cash + ledger fields + dailyProfits row
 *   4. Sets package status completed
 *
 * If package is already completed but endsAt is in the future, still processes.
 * If endsAt passed, simulates missed days from last payout through endsAt (IST calendar).
 *
 * Usage:
 *   node scripts/credit-compounding-remaining.mjs <service-account.json> <userid> [userid...] [--execute]
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
const COL_USERS_BY_UN = 'usersByUsername'
const COL_ACTIVE = 'activePackages'
const COL_DAILY = 'dailyProfits'
const IST = 'Asia/Kolkata'

const args = process.argv.slice(2).filter((a) => a !== '--execute')
const EXECUTE = process.argv.includes('--execute')
const [keyPath, ...userIds] = args

if (!keyPath || userIds.length === 0 || process.argv.includes('-h')) {
  console.error(
    'Usage: node scripts/credit-compounding-remaining.mjs <service-account.json> <userid> [userid...] [--execute]',
  )
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const { FieldValue, Timestamp } = admin.firestore

function istDayKey(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function isSundayIstMs(ms) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'long' }).format(new Date(ms))
  return wd === 'Sunday'
}

/** Midnight IST for a day key YYYY-MM-DD */
function istMidnightMs(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number)
  // IST = UTC+5:30 → UTC midnight IST is previous day 18:30 UTC
  return Date.UTC(y, m - 1, d) - 5.5 * 3600000
}

function nextIstDayKey(dayKey) {
  const ms = istMidnightMs(dayKey) + 86400000
  return istDayKey(ms)
}

async function resolveUid(identifier) {
  const key = String(identifier).trim().toLowerCase()
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get()
  if (mapSnap.exists) {
    const uid = String(mapSnap.data()?.uid ?? '').trim()
    if (uid) return { uid, username: key }
  }
  const direct = await db.collection(COL_USERS).doc(String(identifier).trim()).get()
  if (direct.exists) {
    return { uid: direct.id, username: String(direct.data()?.username ?? key) }
  }
  throw new Error(`User not found: ${identifier}`)
}

function planMeta(ap) {
  const planSnap = ap.planSnapshot && typeof ap.planSnapshot === 'object' ? ap.planSnapshot : {}
  const planType = String(planSnap.planType ?? ap.planType ?? 'daily').toLowerCase()
  const roiPercent = Number(planSnap.roiPercent ?? ap.roiPercent ?? 0)
  const nwMult = Number(ap.frozenNonWorkingCapMultiplier ?? planSnap.nonWorkingIncomeCapMultiplier ?? 2)
  const amount = Number(ap.amount ?? 0)
  const cap = amount * Math.max(nwMult, 0)
  return { planType, roiPercent, nwMult, amount, cap, compound: planType === 'compounding' }
}

/**
 * Simulate daily ROI for each IST calendar day in [fromDay, toDay] inclusive.
 * Starts from package's current nonWorkingPaid / compoundingBalance.
 */
function simulateRemainingDays(ap, fromDayKey, toDayKey) {
  const { compound, roiPercent, amount, cap } = planMeta(ap)
  if (!compound) {
    return { error: 'not compounding', total: 0, days: 0 }
  }
  let nonWorkingPaid = Number(ap.nonWorkingPaid ?? 0)
  let bal = Number(ap.compoundingBalance ?? amount)
  let total = 0
  let days = 0
  let day = fromDayKey
  while (day <= toDayKey) {
    if (!isSundayIstMs(istMidnightMs(day))) {
      const headroom = Math.max(0, cap - nonWorkingPaid)
      const rawDaily = (bal * roiPercent) / 100
      const daily = Math.min(rawDaily, headroom)
      if (daily > 1e-12) {
        total += daily
        nonWorkingPaid += daily
        bal += daily
        days++
      }
      if (nonWorkingPaid >= cap - 1e-9) break
    }
    if (day === toDayKey) break
    day = nextIstDayKey(day)
  }
  return {
    total: Math.round(total * 1e6) / 1e6,
    days,
    finalNonWorkingPaid: nonWorkingPaid,
    finalBalance: bal,
    hitCap: nonWorkingPaid >= cap - 1e-9,
  }
}

async function countExistingPayoutDays(packageId) {
  const snap = await db.collection(COL_DAILY).where('activePackageId', '==', packageId).get()
  return snap.size
}

async function processPackage(username, uid, docSnap) {
  const ap = docSnap.data()
  const meta = planMeta(ap)
  if (!meta.compound) {
    return { skip: true, reason: 'not compounding' }
  }

  const endsAtMs = ap.endsAt?.toMillis?.() ?? 0
  const startedAtMs = ap.startedAt?.toMillis?.() ?? 0
  const nowMs = Date.now()
  const endsDay = istDayKey(endsAtMs)
  const todayDay = istDayKey(nowMs)

  const existingPayouts = await countExistingPayoutDays(docSnap.id)
  const durationDays = Number(ap.durationDays ?? ap.planSnapshot?.durationDays ?? 0)

  /** Days left on calendar until endsAt (IST). */
  let calendarDaysRemaining = 0
  if (todayDay <= endsDay) {
    let d = todayDay
    while (d <= endsDay) {
      if (!isSundayIstMs(istMidnightMs(d))) calendarDaysRemaining++
      if (d === endsDay) break
      d = nextIstDayKey(d)
    }
  }

  /**
   * If endsAt passed: simulate from day after last expected run through endsDay.
   * Use startedAt → endsDay window and skip days already paid (by count).
   */
  let fromDay = todayDay
  let toDay = endsDay

  if (todayDay > endsDay) {
    /** All calendar days from start to end that aren't Sunday */
    const allRunDays = []
    let d = istDayKey(startedAtMs)
    while (d <= endsDay) {
      if (!isSundayIstMs(istMidnightMs(d))) allRunDays.push(d)
      if (d === endsDay) break
      d = nextIstDayKey(d)
    }
    const unpaidDays = Math.max(0, allRunDays.length - existingPayouts)
    if (unpaidDays === 0) {
      return {
        skip: true,
        reason: 'endsAt passed and payout days match schedule',
        existingPayouts,
        allRunDays: allRunDays.length,
        nonWorkingPaid: Number(ap.nonWorkingPaid ?? 0),
        cap: meta.cap,
      }
    }
    /** Simulate only the unpaid tail days */
    const tailStart = allRunDays[Math.max(0, allRunDays.length - unpaidDays)] ?? allRunDays[0]
    fromDay = tailStart
    toDay = endsDay
  }

  const sim = simulateRemainingDays(ap, fromDay, toDay)
  if (sim.total <= 1e-9) {
    return {
      skip: true,
      reason: 'zero credit after simulation',
      fromDay,
      toDay,
      calendarDaysRemaining,
      existingPayouts,
      nonWorkingPaid: Number(ap.nonWorkingPaid ?? 0),
      cap: meta.cap,
    }
  }

  const row = {
    username,
    uid,
    packageId: docSnap.id,
    status: ap.status,
    amount: meta.amount,
    nonWorkingPaidBefore: Number(ap.nonWorkingPaid ?? 0),
    compoundingBalanceBefore: Number(ap.compoundingBalance ?? meta.amount),
    cap: meta.cap,
    roiPercent: meta.roiPercent,
    durationDays,
    endsDay,
    todayDay,
    calendarDaysRemaining,
    existingPayouts,
    simulateFrom: fromDay,
    simulateTo: toDay,
    simulatedRunDays: sim.days,
    creditAmount: sim.total,
    finalNonWorkingPaid: sim.finalNonWorkingPaid,
    hitCap: sim.hitCap,
  }

  if (!EXECUTE) return { ...row, dryRun: true }

  const now = Timestamp.now()
  const batch = db.batch()
  const uRef = db.collection(COL_USERS).doc(uid)
  const pRef = docSnap.ref

  batch.update(uRef, {
    'wallets.cash': FieldValue.increment(sim.total),
    dailyProfitsTotal: FieldValue.increment(sim.total),
    nonWorkingIncomeBalance: FieldValue.increment(sim.total),
    updatedAt: Date.now(),
  })

  batch.update(pRef, {
    nonWorkingPaid: sim.finalNonWorkingPaid,
    compoundingBalance: sim.finalBalance,
    nonWorkingRoiSaturated: sim.hitCap,
    status: 'completed',
    updatedAt: now,
    bulkRemainingCreditAt: now,
    bulkRemainingCreditAmount: sim.total,
    bulkRemainingCreditDays: sim.days,
  })

  await batch.commit()

  await db.collection(COL_DAILY).add({
    userId: uid,
    amount: sim.total,
    activePackageId: docSnap.id,
    note: `Bulk remaining compounding credit (${sim.days} run-days)`,
    createdAt: FieldValue.serverTimestamp(),
  })

  return { ...row, applied: true }
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}\n`)
  const summary = []

  for (const rawId of userIds) {
    try {
      const { uid, username } = await resolveUid(rawId)
      const uSnap = await db.collection(COL_USERS).doc(uid).get()
      const fullName = uSnap.exists ? String(uSnap.data()?.fullName ?? '') : ''

      const activeSnap = await db
        .collection(COL_ACTIVE)
        .where('userId', '==', uid)
        .where('status', '==', 'active')
        .get()

      const allSnap = await db.collection(COL_ACTIVE).where('userId', '==', uid).get()
      const compoundDocs = allSnap.docs.filter((d) => planMeta(d.data()).compound)

      const targets =
        activeSnap.docs.length > 0
          ? activeSnap.docs.filter((d) => planMeta(d.data()).compound)
          : compoundDocs.filter((d) => {
              const ap = d.data()
              const paid = Number(ap.nonWorkingPaid ?? 0)
              const cap = planMeta(ap).cap
              return paid < cap - 1e-6
            })

      console.log(`\n=== ${rawId} (${fullName}) uid=${uid} ===`)
      if (targets.length === 0) {
        console.log('  No compounding packages to settle.')
        summary.push({ username: rawId, skipped: true, reason: 'no packages' })
        continue
      }

      for (const docSnap of targets) {
        const result = await processPackage(username, uid, docSnap)
        console.log(JSON.stringify(result, null, 2))
        summary.push({ username: rawId, packageId: docSnap.id, ...result })
      }
    } catch (e) {
      console.error(`ERROR ${rawId}:`, e.message || e)
      summary.push({ username: rawId, error: String(e.message || e) })
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
  if (!EXECUTE) console.log('\nDry run. Re-run with --execute to apply.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
