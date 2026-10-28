/**
 * Read-only: check every member against the 3× rule (ROI 2× + working 1×).
 * Flags members over the cap, packages with wrong frozen multipliers, and counters that are lower
 * than the ledgers (which would let extra income past the cap).
 *
 * Usage:
 *   node scripts/audit-all-income-caps.mjs <service-account.json>
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const [keyPath] = process.argv.slice(2)
if (!keyPath) {
  console.error('Usage: node scripts/audit-all-income-caps.mjs <service-account.json>')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const EPS = 0.01

async function sumBy(col, key) {
  const snap = await db.collection(col).select(key, 'amount').get()
  const m = new Map()
  for (const d of snap.docs) {
    const k = String(d.get(key) ?? '')
    m.set(k, (m.get(k) ?? 0) + Number(d.get('amount') ?? 0))
  }
  return { map: m, rows: snap.size }
}

async function main() {
  const [cfgSnap, pkgSnap, apSnap, usersSnap] = await Promise.all([
    db.collection('siteSettings').doc('config').get(),
    db.collection('packages').get(),
    db.collection('activePackages').get(),
    db.collection('users').get(),
  ])
  const [roiByPkg, sponsorByUser, teamByUser, rankByUser] = await Promise.all([
    sumBy('dailyProfits', 'activePackageId'),
    sumBy('sponsorBonuses', 'userId'),
    sumBy('teamLevelBonuses', 'userId'),
    sumBy('rankBonuses', 'userId'),
  ])

  const cfg = cfgSnap.data() ?? {}
  console.log('Site settings:', {
    nonWorkingIncomeCapMultiplier: cfg.nonWorkingIncomeCapMultiplier,
    workingIncomeCapMultiplier: cfg.workingIncomeCapMultiplier,
  })
  const badTiers = pkgSnap.docs
    .filter((d) => d.get('workingIncomeCapMultiplier') != null && Number(d.get('workingIncomeCapMultiplier')) !== 1)
    .map((d) => d.get('name'))
  console.log('Package tiers with working cap ≠ 1:', badTiers.length ? badTiers : 'none')

  const byUser = new Map()
  const badPkgs = []
  const roiOverPkgs = []
  const roiCounterLow = []
  for (const d of apSnap.docs) {
    const x = d.data()
    const uid = String(x.userId ?? '')
    const amt = Number(x.amount ?? 0)
    const active = x.status === 'active'
    const nw = Number(x.frozenNonWorkingCapMultiplier ?? x.planSnapshot?.nonWorkingIncomeCapMultiplier ?? 2)
    const w = Number(x.frozenWorkingCapMultiplier ?? x.planSnapshot?.workingIncomeCapMultiplier ?? 3)
    const nwPaid = Number(x.nonWorkingPaid ?? 0)
    const roiLedger = roiByPkg.map.get(d.id) ?? 0
    if (active && (x.frozenWorkingCapMultiplier !== 1 || nw !== 2)) {
      badPkgs.push({ id: d.id, uid, amount: amt, frozenW: x.frozenWorkingCapMultiplier, nw })
    }
    if (nwPaid > amt * nw + EPS) roiOverPkgs.push({ id: d.id, amount: amt, nonWorkingPaid: r2(nwPaid), cap: amt * nw })
    if (active && roiLedger > nwPaid + EPS) {
      roiCounterLow.push({ id: d.id, uid, nonWorkingPaid: r2(nwPaid), roiLedger: r2(roiLedger) })
    }
    const u = byUser.get(uid) ?? { activeStake: 0, ceiling: 0, roiActive: 0, activeCount: 0, allCount: 0 }
    u.allCount++
    if (active) {
      u.activeCount++
      u.activeStake += amt
      u.ceiling += amt * (nw + w)
      u.roiActive += nwPaid
    }
    byUser.set(uid, u)
  }

  const rows = []
  const workingCounterLow = []
  let noPackageUsers = 0
  for (const us of usersSnap.docs) {
    const u = us.data()
    const p = byUser.get(us.id)
    if (!p || p.activeCount === 0) {
      noPackageUsers++
      continue
    }
    const counter = Number.isFinite(Number(u.userTotals?.totalWorkingIncome))
      ? Number(u.userTotals.totalWorkingIncome)
      : Number(u.sponsorBonusTotal ?? 0) + Number(u.teamLevelCommissionTotal ?? 0) + Number(u.rankCommissionTotal ?? 0)
    const ledger =
      (sponsorByUser.map.get(us.id) ?? 0) + (teamByUser.map.get(us.id) ?? 0) + (rankByUser.map.get(us.id) ?? 0)
    if (ledger > counter + EPS) {
      workingCounterLow.push({ username: u.username, counter: r2(counter), ledger: r2(ledger), gap: r2(ledger - counter) })
    }
    const total = p.roiActive + counter
    rows.push({
      username: u.username,
      stake: r2(p.activeStake),
      roi: r2(p.roiActive),
      working: r2(counter),
      total: r2(total),
      cap3x: r2(p.ceiling),
      left: r2(Math.max(0, p.ceiling - total)),
      overBy: r2(Math.max(0, total - p.ceiling)),
      workingLeft: r2(Math.max(0, p.activeStake - counter)),
    })
  }

  const over = rows.filter((r) => r.overBy > EPS).sort((a, b) => b.overBy - a.overBy)
  const atCap = rows.filter((r) => r.left <= EPS)
  const workingFull = rows.filter((r) => r.workingLeft <= EPS && r.left > EPS)

  console.log('\n=== SUMMARY ===')
  console.table([
    { check: 'Members total', value: usersSnap.size },
    { check: 'Members with active package (can earn)', value: rows.length },
    { check: 'Members with no active package (earn nothing)', value: noPackageUsers },
    { check: 'Active packages with wrong caps (should be ROI 2× / working 1×)', value: badPkgs.length },
    { check: 'Packages where ROI paid > 2× (ever)', value: roiOverPkgs.length },
    { check: 'ROI counter lower than ROI ledger (cap leak)', value: roiCounterLow.length },
    { check: 'Working counter lower than ledger (cap leak)', value: workingCounterLow.length },
    { check: 'Members already over 3× (paid before today, now stopped)', value: over.length },
    { check: 'Members at 3× → all income stopped', value: atCap.length },
    { check: 'Members with referral/level full → ROI only', value: workingFull.length },
  ])

  if (badPkgs.length) console.log('\nWrong caps:'), console.table(badPkgs)
  if (roiOverPkgs.length) console.log('\nROI over 2×:'), console.table(roiOverPkgs)
  if (roiCounterLow.length) console.log('\nROI counter low:'), console.table(roiCounterLow)
  if (workingCounterLow.length) console.log('\nWorking counter low:'), console.table(workingCounterLow)
  console.log('\nMembers over 3× (stopped):')
  console.table(over)
  console.log('\nTop 15 members closest to 3× (still earning):')
  console.table(
    rows
      .filter((r) => r.left > EPS)
      .sort((a, b) => b.total / b.cap3x - a.total / a.cap3x)
      .slice(0, 15),
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
