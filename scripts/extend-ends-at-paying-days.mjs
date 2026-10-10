/**
 * Treat package duration as ROI paying days (skip roiOffWeekdays / roiOffDates).
 * Extends endsAt, and reopens completed packages that still have unpaid duration and NW cap room.
 *
 * Usage:
 *   node scripts/extend-ends-at-paying-days.mjs <service-account.json>
 *   node scripts/extend-ends-at-paying-days.mjs <service-account.json> --execute
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const IST = 'Asia/Kolkata'
const IST_OFFSET_MS = 5.5 * 3600000
const EXECUTE = process.argv.includes('--execute')
const keyPath = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!keyPath) {
  console.error('Usage: node scripts/extend-ends-at-paying-days.mjs <service-account.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const { FieldValue, Timestamp } = admin.firestore

function istDayKey(when) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when)
}

function istWeekdayIndex(when) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'short' }).format(when)
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

function nextIstMidnightAfter(ms) {
  const dayStartUtc = Math.floor((ms + IST_OFFSET_MS) / 86400000) * 86400000 - IST_OFFSET_MS
  return ms <= dayStartUtc ? dayStartUtc : dayStartUtc + 86400000
}

function endsAtMillisAfterPayingRoiDays(fromMs, payingDays, offWeekdays, offDates) {
  const target = Math.max(0, Math.floor(payingDays))
  if (target <= 0) return fromMs
  const offW = new Set(offWeekdays)
  const offD = new Set(offDates)
  let cursor = nextIstMidnightAfter(fromMs)
  let found = 0
  for (let guard = 0; guard < 8000 && found < target; guard++) {
    const when = new Date(cursor)
    if (!offW.has(istWeekdayIndex(when)) && !offD.has(istDayKey(when))) found++
    if (found >= target) return cursor + 12 * 3600000
    cursor += 86400000
  }
  return cursor
}

async function main() {
  const cfg = (await db.collection('siteSettings').doc('config').get()).data() || {}
  const offW = Array.isArray(cfg.roiOffWeekdays) ? cfg.roiOffWeekdays.map(Number) : [0, 6]
  const offD = Array.isArray(cfg.roiOffDates) ? cfg.roiOffDates.map(String) : []

  const profits = await db.collection('dailyProfits').get()
  const paidByPkg = new Map()
  for (const d of profits.docs) {
    const id = String(d.data().activePackageId || '')
    if (!id) continue
    paidByPkg.set(id, (paidByPkg.get(id) || 0) + 1)
  }

  const pkgs = await db.collection('activePackages').get()
  const now = Date.now()
  const plans = []
  const reopenUsers = new Set()
  const usersAlreadyActive = new Set()
  for (const doc of pkgs.docs) {
    if (doc.data().status === 'active' && doc.data().userId) usersAlreadyActive.add(String(doc.data().userId))
  }

  for (const doc of pkgs.docs) {
    const ap = doc.data()
    const ps = ap.planSnapshot && typeof ap.planSnapshot === 'object' ? ap.planSnapshot : {}
    const duration = Math.floor(Number(ps.durationDays ?? ap.durationDays ?? 0))
    const amount = Number(ap.amount ?? 0)
    const nwMult = Number(ap.frozenNonWorkingCapMultiplier ?? ps.nonWorkingIncomeCapMultiplier ?? 2)
    const cap = amount * Math.max(nwMult, 0)
    const paidAmt = Number(ap.nonWorkingPaid ?? 0)
    const paidDays = paidByPkg.get(doc.id) || 0
    const remainingDays = duration - paidDays
    const headroom = cap - paidAmt
    const endsMs = ap.endsAt?.toMillis?.() ?? 0
    if (duration <= 0 || remainingDays <= 0 || headroom <= 1e-9) continue
    if (ap.adminRoiPaused === true) continue
    const newEnds = endsAtMillisAfterPayingRoiDays(now, remainingDays, offW, offD)
    const shouldReopen = ap.status === 'completed'
    const shouldExtend = ap.status === 'active' && endsMs < newEnds - 1000
    if (!shouldReopen && !shouldExtend) continue
    plans.push({
      id: doc.id,
      userId: String(ap.userId || ''),
      status: ap.status,
      amount,
      paidDays,
      duration,
      remainingDays,
      paidAmt,
      cap,
      oldEnds: endsMs ? new Date(endsMs).toISOString() : null,
      newEnds: new Date(newEnds).toISOString(),
      newEndsMs: newEnds,
      reopen: shouldReopen,
    })
    if (shouldReopen) reopenUsers.add(String(ap.userId || ''))
  }

  console.log(JSON.stringify({ execute: EXECUTE, packages: plans.length, reopenedUsers: reopenUsers.size, sample: plans.slice(0, 8) }, null, 2))
  const target = plans.find((p) => p.amount === 500 && p.paidDays === 72)
  if (target) console.log('500/72 example', JSON.stringify(target, null, 2))

  if (!EXECUTE) {
    console.log('Dry run. Re-run with --execute.')
    return
  }

  for (const row of plans) {
    const patch = {
      endsAt: Timestamp.fromMillis(row.newEndsMs),
      durationCountsPayingDays: true,
      updatedAt: Date.now(),
    }
    if (row.reopen) patch.status = 'active'
    await db.collection('activePackages').doc(row.id).set(patch, { merge: true })
  }

  for (const uid of reopenUsers) {
    if (!uid || usersAlreadyActive.has(uid)) continue
    const bene = await db.collection('users').doc(uid).get()
    const sponsor = bene.data()?.sponsorUid
    if (!sponsor) continue
    await db.collection('users').doc(sponsor).set(
      { activeDirects: FieldValue.increment(1), updatedAt: Date.now() },
      { merge: true },
    )
  }

  console.log('Updated', plans.length, 'packages.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
