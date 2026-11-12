/**
 * Backfill team-level income skipped when Sat/Sun burned the calendar 50-day window.
 * Window now counts paying days only (roiOffWeekdays excluded).
 *
 * Usage:
 *   node scripts/backfill-team-level-paying-window.mjs <sa.json>            (dry run)
 *   node scripts/backfill-team-level-paying-window.mjs <sa.json> --execute
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))
const { FieldValue, Timestamp } = admin.firestore

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute')
const [keyPath] = argv.filter((a) => !a.startsWith('--'))
if (!keyPath) {
  console.error('Usage: node scripts/backfill-team-level-paying-window.mjs <sa.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const DEFAULT_CAP_PCT = 50
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const ms = (v) => (v?.toMillis?.() ?? (typeof v === 'number' ? v : null))

function istDayKey(when = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when)
}

function istWeekdayIndex(when = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(when)
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0
}

function normalizeOffWeekdays(raw) {
  if (!Array.isArray(raw)) return [0, 6]
  const out = [
    ...new Set(raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ].sort((a, b) => a - b)
  return out.length ? out : [0, 6]
}

function normalizeOffDates(raw) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((d) => String(d).trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)))]
}

function calendarElapsed(startMs, asOfMs) {
  const a = istDayKey(new Date(startMs))
  const b = istDayKey(new Date(asOfMs))
  const [sy, sm, sd] = a.split('-').map(Number)
  const [ny, nm, nd] = b.split('-').map(Number)
  return Math.max(0, Math.floor((Date.UTC(ny, nm - 1, nd) - Date.UTC(sy, sm - 1, sd)) / 86400000))
}

function payingElapsed(startMs, asOfMs, offWeekdays, offDates) {
  const a = istDayKey(new Date(startMs))
  const b = istDayKey(new Date(asOfMs))
  const [sy, sm, sd] = a.split('-').map(Number)
  const [ny, nm, nd] = b.split('-').map(Number)
  let cursor = Date.UTC(sy, sm - 1, sd)
  const endMs = Date.UTC(ny, nm - 1, nd)
  if (endMs <= cursor) return 0
  const offW = new Set(offWeekdays)
  const offD = new Set(offDates)
  let paid = 0
  for (let guard = 0; guard < 8000 && cursor < endMs; guard++) {
    const when = new Date(cursor + 12 * 3600000)
    const key = istDayKey(when)
    if (!offW.has(istWeekdayIndex(when)) && !offD.has(key)) paid++
    cursor += 86400000
  }
  return paid
}

function maxPayDaysForRow(row, durationDays) {
  const dur = Math.max(0, Math.floor(durationDays))
  if (dur <= 0) return null
  const raw = row?.uplineDurationCapPercent != null ? Number(row.uplineDurationCapPercent) : DEFAULT_CAP_PCT
  const capPct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : DEFAULT_CAP_PCT))
  return Math.floor((dur * capPct) / 100)
}

function workingTotal(ud) {
  if (ud?.userTotals?.totalWorkingIncome != null && Number.isFinite(Number(ud.userTotals.totalWorkingIncome))) {
    return Number(ud.userTotals.totalWorkingIncome)
  }
  return (
    Number(ud?.sponsorBonusTotal ?? 0) +
    Number(ud?.teamLevelCommissionTotal ?? 0) +
    Number(ud?.rankCommissionTotal ?? 0)
  )
}

function room3x(uid, users, byUserPkgs, plannedExtra) {
  const pkgs = byUserPkgs.get(uid) || []
  let ceiling = 0
  let roiPaid = 0
  for (const p of pkgs) {
    if (p.status !== 'active') continue
    const amt = Number(p.amount || 0)
    const nw = Number(p.frozenNonWorkingCapMultiplier ?? p.planSnapshot?.nonWorkingIncomeCapMultiplier ?? 2)
    const w = Number(p.frozenWorkingCapMultiplier ?? p.planSnapshot?.workingIncomeCapMultiplier ?? 1)
    ceiling += amt * (Math.max(0, nw) + Math.max(0, w))
    roiPaid += Number(p.nonWorkingPaid || 0)
  }
  const working = workingTotal(users.get(uid) || {}) + (plannedExtra.get(uid) || 0)
  return Math.max(0, ceiling - roiPaid - working)
}

async function main() {
  console.log('Loading settings…')
  const cfg = (await db.collection('siteSettings').doc('config').get()).data() || {}
  const offWeekdays = normalizeOffWeekdays(cfg.roiOffWeekdays)
  const offDates = normalizeOffDates(cfg.roiOffDates)
  console.log('ROI-off weekdays (0=Sun..6=Sat):', offWeekdays)

  console.log('Loading users…')
  const usersSnap = await db.collection('users').get()
  const users = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]))
  console.log(' users:', users.size)

  console.log('Loading activePackages…')
  const apSnap = await db.collection('activePackages').get()
  const pkgs = apSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const byUserPkgs = new Map()
  for (const p of pkgs) {
    const uid = String(p.userId || '')
    if (!byUserPkgs.has(uid)) byUserPkgs.set(uid, [])
    byUserPkgs.get(uid).push(p)
  }
  console.log(' packages:', pkgs.length)

  console.log('Loading dailyProfits (amount/package/date only)…')
  const dailySnap = await db.collection('dailyProfits').select('activePackageId', 'amount', 'createdAt').get()
  const roiByPkg = new Map()
  for (const d of dailySnap.docs) {
    const x = d.data()
    const pkg = String(x.activePackageId || '')
    const t = ms(x.createdAt)
    if (!pkg || !t) continue
    if (!roiByPkg.has(pkg)) roiByPkg.set(pkg, [])
    roiByPkg.get(pkg).push({ amount: Number(x.amount || 0), at: t, day: istDayKey(new Date(t)) })
  }
  console.log(' ROI rows:', dailySnap.size)

  console.log('Loading teamLevelBonuses keys…')
  const teamSnap = await db.collection('teamLevelBonuses').select('userId', 'activePackageId', 'level', 'createdAt').get()
  const existing = new Set()
  for (const d of teamSnap.docs) {
    const x = d.data()
    const t = ms(x.createdAt)
    if (!t) continue
    existing.add(`${x.activePackageId}|${istDayKey(new Date(t))}|${x.userId}|${x.level}`)
  }
  console.log(' team bonus rows:', teamSnap.size)

  const hasActive = (uid) => (byUserPkgs.get(uid) || []).some((p) => p.status === 'active')
  const plan = []
  const plannedExtra = new Map()
  let pkgsScanned = 0
  let pkgsNeeding = 0

  for (let i = 0; i < pkgs.length; i++) {
    if (i > 0 && i % 50 === 0) console.log(`  scanned packages ${i}/${pkgs.length}, planned credits ${plan.length}`)
    const p = pkgs[i]
    const start = ms(p.startedAt)
    if (!start) continue
    const downlineUid = String(p.userId || '')
    const ud = users.get(downlineUid) || {}
    const planSnap =
      p.planSnapshot && typeof p.planSnapshot === 'object'
        ? p.planSnapshot
        : {
            durationDays: Number(p.durationDays || 0),
            teamLevels: users.get(downlineUid)?.rankCompensationSnapshot?.teamLevels || [],
          }
    const durationDays = Number(planSnap.durationDays ?? p.durationDays ?? 0)
    let teamRows = Array.isArray(planSnap.teamLevels) ? planSnap.teamLevels : []
    if (!teamRows.some((r) => Number(r?.percent) > 0)) {
      const fromUser = users.get(downlineUid)?.rankCompensationSnapshot?.teamLevels
      if (Array.isArray(fromUser) && fromUser.some((r) => Number(r?.percent) > 0)) teamRows = fromUser
    }
    if (!teamRows.some((r) => Number(r?.percent) > 0) || durationDays <= 0) continue

    const rowMaxes = teamRows.map((r) => maxPayDaysForRow(r, durationDays)).filter((n) => n != null && n > 0)
    if (!rowMaxes.length) continue
    const primaryMax = Math.max(...rowMaxes)

    // Only packages past calendar window but still inside paying window (or recently)
    const nowPay = payingElapsed(start, Date.now(), offWeekdays, offDates)
    const nowCal = calendarElapsed(start, Date.now())
    if (nowCal < primaryMax && nowPay < primaryMax) continue // still in both windows — daily job handles
    // If fully past paying window too, still backfill the gap days between cal-close and pay-close

    const rois = roiByPkg.get(p.id) || []
    if (!rois.length) continue
    pkgsScanned++

    const missed = []
    for (const roi of rois) {
      const cal = calendarElapsed(start, roi.at)
      const pay = payingElapsed(start, roi.at, offWeekdays, offDates)
      if (cal >= primaryMax && pay < primaryMax && roi.amount > 1e-12) missed.push({ ...roi, cal, pay })
    }
    if (!missed.length) continue
    pkgsNeeding++

    for (const roi of missed) {
      let child = downlineUid
      for (let depth = 0; depth < teamRows.length; depth++) {
        const row = teamRows[depth]
        const upl = users.get(child)?.sponsorUid
        if (!upl) break
        const maxPay = maxPayDaysForRow(row, durationDays)
        const payEl = payingElapsed(start, roi.at, offWeekdays, offDates)
        if (maxPay != null && payEl >= maxPay) {
          child = upl
          continue
        }
        if (!row || !(Number(row.percent) > 0)) {
          child = upl
          continue
        }
        const uplUser = users.get(upl)
        if (!uplUser || uplUser.blocked || !hasActive(upl)) {
          child = upl
          continue
        }
        if (Number(uplUser.activeDirects ?? 0) < Number(row.requiredDirects ?? 0)) {
          child = upl
          continue
        }

        const key = `${p.id}|${roi.day}|${upl}|${row.level}`
        if (existing.has(key)) {
          child = upl
          continue
        }

        const gross = (roi.amount * Number(row.percent)) / 100
        const room = room3x(upl, users, byUserPkgs, plannedExtra)
        const payAmt = r2(Math.min(gross, Math.max(0, room)))
        if (payAmt <= 0.01) {
          child = upl
          continue
        }

        plan.push({
          key,
          backfillId: `tlb_paywin_${upl}_${p.id}_${roi.day}_L${row.level}`,
          upl,
          uplUsername: uplUser.username || upl.slice(0, 8),
          fromUsername: ud.username || downlineUid.slice(0, 8),
          downlineUid,
          pkgId: p.id,
          pkgStart: start,
          level: row.level,
          roiDay: roi.day,
          roiAmt: r2(roi.amount),
          payAmt,
          payElapsed: payEl,
          maxPay,
          remainingDays: maxPay != null ? Math.max(0, maxPay - payEl) : null,
          durationDays,
        })
        existing.add(key)
        plannedExtra.set(upl, (plannedExtra.get(upl) || 0) + payAmt)
        child = upl
      }
    }
  }

  const byUserMap = new Map()
  for (const x of plan) {
    const cur = byUserMap.get(x.upl) || { username: x.uplUsername, credits: 0, total: 0 }
    cur.credits++
    cur.total = r2(cur.total + x.payAmt)
    byUserMap.set(x.upl, cur)
  }
  const byUser = [...byUserMap.values()].sort((a, b) => b.total - a.total)

  console.log('\n=== SUMMARY ===')
  console.table([
    { check: 'Packages past calendar window (candidates)', value: pkgsScanned },
    { check: 'Packages with missed credits', value: pkgsNeeding },
    { check: 'Credits to create', value: plan.length },
    { check: 'Uplines affected', value: byUser.length },
    { check: 'Total $', value: r2(plan.reduce((s, x) => s + x.payAmt, 0)) },
  ])
  console.log('\n=== ALL AFFECTED UPLINES ===')
  console.table(byUser)
  console.log('\n=== SAMPLE (first 30) ===')
  console.table(
    plan.slice(0, 30).map((x) => ({
      upline: x.uplUsername,
      from: x.fromUsername,
      day: x.roiDay,
      lvl: x.level,
      pay: x.payAmt,
      payDayNo: x.payElapsed,
      of: x.maxPay,
    })),
  )

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to credit.')
    return
  }

  let ok = 0
  let skip = 0
  for (const item of plan) {
    const txRef = db.collection('teamLevelBonuses').doc(item.backfillId)
    const applied = await db.runTransaction(async (tx) => {
      if ((await tx.get(txRef)).exists) return false
      tx.set(txRef, {
        userId: item.upl,
        fromUserId: item.downlineUid,
        level: item.level,
        amount: item.payAmt,
        activePackageId: item.pkgId,
        sourceDailyRoi: item.roiAmt,
        distribution: 'daily_roi_share_backfill_paying_window',
        downlinePackageStartedAt: Timestamp.fromMillis(item.pkgStart),
        teamLevelWindowDurationDays: item.durationDays,
        teamLevelWindowCapPercent: DEFAULT_CAP_PCT,
        teamLevelWindowMaxPayDays: item.maxPay,
        teamLevelWindowRemainingDays: item.remainingDays,
        backfillReason: 'calendar_window_skipped_sat_sun_now_paying_days',
        roiDayIst: item.roiDay,
        createdAt: FieldValue.serverTimestamp(),
      })
      tx.update(db.collection('users').doc(item.upl), {
        'wallets.cash': FieldValue.increment(item.payAmt),
        workingIncomeBalance: FieldValue.increment(item.payAmt),
        teamLevelCommissionTotal: FieldValue.increment(item.payAmt),
        'userTotals.totalWorkingIncome': FieldValue.increment(item.payAmt),
        updatedAt: Date.now(),
      })
      tx.set(
        db.collection('activePackages').doc(item.pkgId),
        {
          workingPaid: FieldValue.increment(item.payAmt),
          workingIncomeEarned: FieldValue.increment(item.payAmt),
          updatedAt: Date.now(),
        },
        { merge: true },
      )
      return true
    })
    if (!applied) {
      skip++
      continue
    }
    await db.collection('notifications').add({
      userId: item.upl,
      title: 'Team level income adjustment',
      body: `Credited $${item.payAmt.toFixed(2)} level ${item.level} (paying-day window correction) from ${item.fromUsername} for ${item.roiDay}.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
    ok++
    if (ok % 25 === 0) console.log(`…credited ${ok}/${plan.length}`)
  }

  await db.collection('auditLogs').add({
    actorUid: 'system:team-level-paying-window-backfill',
    action: 'backfillTeamLevelPayingWindow',
    detail: { credited: ok, skipped: skip, totalAmount: r2(plan.reduce((s, x) => s + x.payAmt, 0)), uplines: byUser.length },
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log(`\nDone. Credited ${ok}, skipped ${skip}.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
