/**
 * Switch the plan to: ROI up to 2× stake + working income (sponsor / team level / rank) up to 1× stake = 3× total.
 * Updates site settings, package tiers, every active package (frozen multipliers + planSnapshot) and
 * users.rankCompensationSnapshot, then reports members already at or above the new caps.
 *
 * Usage:
 *   node scripts/apply-3x-income-cap.mjs <service-account.json>            (dry run)
 *   node scripts/apply-3x-income-cap.mjs <service-account.json> --execute
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))
const { FieldValue } = admin.firestore

const NW_MULT = 2
const W_MULT = 1

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute')
const [keyPath] = argv.filter((a) => !a.startsWith('--'))
if (!keyPath) {
  console.error('Usage: node scripts/apply-3x-income-cap.mjs <service-account.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 400)) batch.set(op.ref, op.data, { merge: true })
    await batch.commit()
  }
}

async function main() {
  const now = Date.now()
  const cfgRef = db.collection('siteSettings').doc('config')
  const cfg = (await cfgRef.get()).data() ?? {}
  console.log('siteSettings before:', {
    nonWorkingIncomeCapMultiplier: cfg.nonWorkingIncomeCapMultiplier,
    workingIncomeCapMultiplier: cfg.workingIncomeCapMultiplier,
  })

  const pkgSnap = await db.collection('packages').get()
  const pkgOps = []
  for (const d of pkgSnap.docs) {
    const x = d.data()
    if (x.workingIncomeCapMultiplier != null && Number(x.workingIncomeCapMultiplier) !== W_MULT) {
      pkgOps.push({ ref: d.ref, data: { workingIncomeCapMultiplier: W_MULT, updatedAt: now } })
    }
  }
  console.log(`Package tiers with a working-cap override to change: ${pkgOps.length}`)

  const apSnap = await db.collection('activePackages').where('status', '==', 'active').get()
  const apOps = []
  const byUser = new Map()
  for (const d of apSnap.docs) {
    const x = d.data()
    const amt = Number(x.amount ?? 0)
    const ps = x.planSnapshot && typeof x.planSnapshot === 'object' ? x.planSnapshot : null
    const nw = Number(x.frozenNonWorkingCapMultiplier ?? ps?.nonWorkingIncomeCapMultiplier ?? NW_MULT)
    const data = { frozenWorkingCapMultiplier: W_MULT, updatedAt: now }
    if (x.frozenNonWorkingCapMultiplier == null) data.frozenNonWorkingCapMultiplier = nw
    if (ps) {
      data.planSnapshot = {
        workingMultiplier: W_MULT,
        workingIncomeCapMultiplier: W_MULT,
        workingCap: amt * W_MULT,
        totalIncomeCapMultiplier: nw + W_MULT,
        totalReturnMultiplier: nw + W_MULT,
        totalReturnPercent: (nw + W_MULT) * 100,
      }
    }
    apOps.push({ ref: d.ref, data })
    const uid = String(x.userId ?? '')
    const agg = byUser.get(uid) ?? { stake: 0, roiCeiling: 0, roiPaid: 0 }
    agg.stake += amt
    agg.roiCeiling += amt * nw
    agg.roiPaid += Number(x.nonWorkingPaid ?? 0)
    byUser.set(uid, agg)
  }
  console.log(`Active packages to update: ${apOps.length} (members: ${byUser.size})`)

  const userOps = []
  const report = []
  const uids = [...byUser.keys()]
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((u) => db.collection('users').doc(u))
    const docs = await db.getAll(...refs)
    for (const us of docs) {
      if (!us.exists) continue
      const u = us.data()
      const agg = byUser.get(us.id)
      const working =
        Number.isFinite(Number(u.userTotals?.totalWorkingIncome))
          ? Number(u.userTotals.totalWorkingIncome)
          : Number(u.sponsorBonusTotal ?? 0) + Number(u.teamLevelCommissionTotal ?? 0) + Number(u.rankCommissionTotal ?? 0)
      const workingCap = agg.stake * W_MULT
      const totalCap = agg.roiCeiling + workingCap
      const total = agg.roiPaid + working
      if (working >= workingCap - 1e-9 || total >= totalCap - 1e-9) {
        report.push({
          username: u.username,
          stake: r2(agg.stake),
          roiPaid: r2(agg.roiPaid),
          working: r2(working),
          total: r2(total),
          cap3x: r2(totalCap),
          overBy: r2(Math.max(0, total - totalCap)),
          status: total >= totalCap - 1e-9 ? 'ALL income stops' : 'referral/level stop, ROI continues',
        })
      }
      if (u.rankCompensationSnapshot && typeof u.rankCompensationSnapshot === 'object') {
        userOps.push({
          ref: us.ref,
          data: { rankCompensationSnapshot: { workingIncomeCapMultiplier: W_MULT }, updatedAt: now },
        })
      }
    }
  }

  report.sort((a, b) => b.overBy - a.overBy || b.total - a.total)
  const stopped = report.filter((r) => r.status === 'ALL income stops').length
  console.log(`\nMembers affected immediately: ${report.length} (all income stops: ${stopped}, referral/level only: ${report.length - stopped})`)
  console.table(report)

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to apply.')
    return
  }

  await cfgRef.set(
    {
      nonWorkingIncomeCapMultiplier: NW_MULT,
      workingIncomeCapMultiplier: W_MULT,
      planSettingsVersion: FieldValue.increment(1),
      updatedAt: now,
    },
    { merge: true },
  )
  await commitInChunks(pkgOps)
  await commitInChunks(apOps)
  await commitInChunks(userOps)
  console.log(
    `\nApplied: siteSettings, ${pkgOps.length} package tiers, ${apOps.length} active packages, ${userOps.length} user snapshots.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
