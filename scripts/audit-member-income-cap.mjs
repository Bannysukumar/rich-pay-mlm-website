/**
 * Read-only: compare a member's ROI + sponsor + team-level + rank income against stake caps.
 *
 * Usage:
 *   node scripts/audit-member-income-cap.mjs <service-account.json> <username-or-uid>
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
  console.error('Usage: node scripts/audit-member-income-cap.mjs <service-account.json> <username-or-uid>')
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
  return t ? new Date(t).toISOString().slice(0, 10) : null
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

async function sumLedger(col, uid) {
  const snap = await db.collection(col).where('userId', '==', uid).get()
  let total = 0
  const byPkg = new Map()
  const byDay = new Map()
  for (const d of snap.docs) {
    const x = d.data()
    const amt = Number(x.amount ?? 0)
    total += amt
    const pk = String(x.activePackageId ?? '(none)')
    byPkg.set(pk, (byPkg.get(pk) ?? 0) + amt)
    const day = iso(x.createdAt) ?? '(no date)'
    byDay.set(day, (byDay.get(day) ?? 0) + amt)
  }
  return { count: snap.size, total, byPkg, byDay, docs: snap.docs }
}

async function main() {
  const uid = await resolveUid(rawId)
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}

  console.log('=== MEMBER ===')
  console.log({
    uid,
    username: u.username,
    fullName: u.fullName,
    blocked: Boolean(u.blocked),
    activeDirects: u.activeDirects,
    wallets: u.wallets,
    dailyProfitsTotal: r2(u.dailyProfitsTotal),
    sponsorBonusTotal: r2(u.sponsorBonusTotal),
    teamLevelCommissionTotal: r2(u.teamLevelCommissionTotal),
    rankCommissionTotal: r2(u.rankCommissionTotal),
    'userTotals.totalWorkingIncome': r2(u.userTotals?.totalWorkingIncome),
    nonWorkingIncomeBalance: r2(u.nonWorkingIncomeBalance),
    workingIncomeBalance: r2(u.workingIncomeBalance),
  })

  const pkSnap = await db.collection('activePackages').where('userId', '==', uid).get()
  const roi = await sumLedger('dailyProfits', uid)
  const sponsor = await sumLedger('sponsorBonuses', uid)
  const team = await sumLedger('teamLevelBonuses', uid)
  const rank = await sumLedger('rankBonuses', uid)

  console.log('\n=== PACKAGES ===')
  let totalStake = 0
  let activeStake = 0
  let activeWorkingCeiling = 0
  let allWorkingCeiling = 0
  const pkgRows = []
  for (const d of pkSnap.docs.sort((a, b) => (ms(a.data().startedAt) ?? 0) - (ms(b.data().startedAt) ?? 0))) {
    const x = d.data()
    const amt = Number(x.amount ?? 0)
    const ps = x.planSnapshot ?? {}
    const nwMult = Number(x.frozenNonWorkingCapMultiplier ?? ps.nonWorkingIncomeCapMultiplier ?? 2)
    const wMult = Number(x.frozenWorkingCapMultiplier ?? ps.workingIncomeCapMultiplier ?? 3)
    totalStake += amt
    allWorkingCeiling += amt * wMult
    if (x.status === 'active') {
      activeStake += amt
      activeWorkingCeiling += amt * wMult
    }
    const roiLedger = roi.byPkg.get(d.id) ?? 0
    pkgRows.push({
      id: d.id,
      status: x.status,
      amount: amt,
      planType: x.planType ?? ps.planType,
      roiPct: ps.roiPercent ?? x.roiPercent,
      start: iso(x.startedAt),
      ends: iso(x.endsAt),
      nwMult,
      wMult,
      roiCap: r2(amt * nwMult),
      nonWorkingPaid: r2(x.nonWorkingPaid),
      roiLedger: r2(roiLedger),
      roiOverCap: roiLedger > amt * nwMult + 0.01 ? r2(roiLedger - amt * nwMult) : 0,
      stopAll: ps.stopAllIncomeWhenWorkingCapReached === true,
      adminRoiPaused: x.adminRoiPaused === true,
    })
  }
  console.table(pkgRows)

  const workingLedger = sponsor.total + team.total + rank.total
  const totalIncome = roi.total + workingLedger

  console.log('\n=== LEDGER TOTALS ===')
  console.table([
    { type: 'ROI (dailyProfits)', rows: roi.count, total: r2(roi.total) },
    { type: 'Sponsor bonus', rows: sponsor.count, total: r2(sponsor.total) },
    { type: 'Team level bonus', rows: team.count, total: r2(team.total) },
    { type: 'Rank bonus', rows: rank.count, total: r2(rank.total) },
    { type: 'Working (sponsor+team+rank)', rows: '', total: r2(workingLedger) },
    { type: 'ALL INCOME', rows: '', total: r2(totalIncome) },
  ])

  console.log('\n=== CAP CHECK ===')
  console.table([
    { metric: 'Total stake (all packages)', value: r2(totalStake) },
    { metric: 'Active stake', value: r2(activeStake) },
    { metric: '3x of total stake', value: r2(totalStake * 3) },
    { metric: 'Working ceiling (active pkgs, per code)', value: r2(activeWorkingCeiling) },
    { metric: 'Working ceiling (all pkgs)', value: r2(allWorkingCeiling) },
    { metric: 'Working income credited (ledger)', value: r2(workingLedger) },
    { metric: 'Working income counter on user doc', value: r2(u.userTotals?.totalWorkingIncome ?? (Number(u.sponsorBonusTotal ?? 0) + Number(u.teamLevelCommissionTotal ?? 0) + Number(u.rankCommissionTotal ?? 0))) },
    { metric: 'ROI + Level (team) income', value: r2(roi.total + team.total) },
    { metric: 'ROI + Level as x of total stake', value: totalStake ? r2((roi.total + team.total) / totalStake) : null },
    { metric: 'All income as x of total stake', value: totalStake ? r2(totalIncome / totalStake) : null },
    { metric: 'Working income over active ceiling', value: r2(Math.max(0, workingLedger - activeWorkingCeiling)) },
    { metric: 'Working income over all-pkg ceiling', value: r2(Math.max(0, workingLedger - allWorkingCeiling)) },
  ])

  console.log('\n=== TEAM LEVEL BONUS BY DAY (last 30 days with credits) ===')
  const teamDays = [...team.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  console.table(teamDays.slice(-30).map(([day, total]) => ({ day, total: r2(total) })))

  console.log('\n=== ROI BY DAY (last 30 days with credits) ===')
  const roiDays = [...roi.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  console.table(roiDays.slice(-30).map(([day, total]) => ({ day, total: r2(total) })))

  // Duplicate ROI: same package credited more than once on the same IST day.
  const dupRoi = new Map()
  for (const d of roi.docs) {
    const x = d.data()
    const t = ms(x.createdAt)
    if (!t) continue
    const istDay = new Date(t + 5.5 * 3600000).toISOString().slice(0, 10)
    const k = `${x.activePackageId}|${istDay}`
    dupRoi.set(k, [...(dupRoi.get(k) ?? []), r2(x.amount)])
  }
  const dupRows = [...dupRoi.entries()].filter(([, v]) => v.length > 1)
  console.log(`\n=== DUPLICATE ROI (same package, same IST day): ${dupRows.length} ===`)
  if (dupRows.length) console.table(dupRows.slice(0, 50).map(([k, v]) => ({ key: k, amounts: v.join(', ') })))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
