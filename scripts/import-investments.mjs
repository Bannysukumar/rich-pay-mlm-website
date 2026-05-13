/**
 * Import every row of `admin_exports/View All Investments.xlsx` into Firebase
 * as an `activePackages` document, mirroring exactly what the `activatePackage`
 * callable in `functions/src/index.ts` writes (full planSnapshot frozen from
 * live site settings, team levels, and ranks).
 *
 * After writing the stakes, also rebuild the upline team counters
 * (totalTeamBusiness / powerTeamBusiness / restTeamBusiness) and the sponsor
 * activeDirects counter, to match what the live callable would have produced.
 *
 * Idempotent: every activePackages doc gets a deterministic ID
 * `imp_inv_<SERIAL>` so re-runs overwrite instead of duplicating, and pass 3
 * always zeroes the four derived counters before re-deriving from scratch.
 *
 * Decisions confirmed with operator:
 *   - One activePackages doc per row (174 docs).
 *   - Full planSnapshot mirror.
 *   - Rebuild team counters + activeDirects.
 *   - Do NOT pay sponsor bonuses (already paid in legacy).
 *   - Use Excel DATE column as startedAt.
 *
 * Usage:
 *   node scripts/import-investments.mjs <path-to-service-account.json> [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORTS_DIR = path.resolve(__dirname, '..', '..', 'admin_exports')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const keyArg = args.find((a) => !a.startsWith('-'))

if (!keyArg) {
  console.error('Usage: node scripts/import-investments.mjs <service-account.json> [--dry-run]')
  process.exit(1)
}
const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(keyArg), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
const db = admin.firestore()
const { Timestamp, FieldValue } = admin.firestore

const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'
const COL_ACTIVE = 'activePackages'
const COL_PACKAGES = 'packages'
const COL_SETTINGS = 'siteSettings'
const COL_TEAM_LEVELS = 'teamLevels'
const COL_RANKS = 'ranks'

const TAG = 'imp_inv'

function parseMoney(v) {
  if (v == null) return 0
  const s = String(v).replace(/[^0-9.\-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function parseDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(s ?? '').trim())
  if (!m) return Date.now()
  const [, dd, mm, yyyy, hh, mi, ap] = m
  let H = Number(hh)
  if (ap) {
    if (ap.toUpperCase() === 'PM' && H !== 12) H += 12
    if (ap.toUpperCase() === 'AM' && H === 12) H = 0
  }
  const t = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), H, Number(mi), 0)
  return Number.isFinite(t) ? t : Date.now()
}

function normalizePowerRestPercent(pRaw, rRaw) {
  let p = Math.max(0, Number(pRaw))
  let r = Math.max(0, Number(rRaw))
  const s = p + r
  if (!Number.isFinite(s) || s <= 0) return { p: 50, r: 50 }
  return { p: (p / s) * 100, r: (r / s) * 100 }
}

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
    withdrawPackageCaps: Array.isArray(settings.withdrawPackageCaps) ? settings.withdrawPackageCaps : [],
    defaultWithdrawalPercentOfPackage: Number(settings.defaultWithdrawalPercentOfPackage ?? 20),
  }
}

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE WRITE'} | project: ${serviceAccount.project_id}`)
console.log(`Loading source spreadsheet from: ${EXPORTS_DIR}`)
const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'View All Investments.xlsx'))
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter((r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()))
console.log(`Investment rows: ${rows.length}`)

console.log('Loading siteSettings/config…')
const cfgSnap = await db.collection(COL_SETTINGS).doc('config').get()
if (!cfgSnap.exists) throw new Error('siteSettings/config is missing — run the admin seeder first.')
const settings = cfgSnap.data() ?? {}
const teamDepth = Math.min(100, Math.max(1, Number(settings.teamLevelsCount ?? 30)))
const sponsorPctFrozen = Number(settings.sponsorPercent ?? 5)
const siteNwMult = Number(settings.nonWorkingIncomeCapMultiplier ?? 2)
const frozenWorkingCapMultiplier = Number(settings.workingIncomeCapMultiplier ?? 3)
const stopAllIncomeFrozen = settings.stopAllIncomeWhenWorkingCapReached === true
const minWithdrawFrozen = Number(settings.minWithdrawal ?? 10)
const withdrawFeeFrozen = Number(settings.withdrawFeePercent ?? 10)
const planSettingsVersion = Number(settings.planSettingsVersion ?? 0)
const { p: rkPowerPct, r: rkRestPct } = normalizePowerRestPercent(
  Number(settings.rankQualificationPowerPercent ?? 50),
  Number(settings.rankQualificationRestPercent ?? 50),
)
const withdrawFrozen = freezeWithdrawPolicyFromSettings(settings)

console.log('Loading active teamLevels…')
const tlSnap = await db.collection(COL_TEAM_LEVELS).where('active', '==', true).get()
const tlByLevel = new Map()
for (const d of tlSnap.docs) {
  const x = d.data()
  const lvl = Number(x.level ?? 0)
  if (!Number.isFinite(lvl) || lvl < 1) continue
  tlByLevel.set(lvl, {
    level: lvl,
    percent: Number(x.percent ?? 0),
    requiredDirects: Number(x.requiredDirects ?? x.directs ?? 0),
    conditionDescription: x.conditionDescription != null ? String(x.conditionDescription).trim() : '',
  })
}
const teamLevelsFrozen = Array.from({ length: teamDepth }, (_, i) => {
  const L = i + 1
  return tlByLevel.get(L) ?? { level: L, percent: 0, requiredDirects: 0, conditionDescription: '' }
})

console.log('Loading active ranks…')
const rkSnap = await db.collection(COL_RANKS).where('active', '==', true).get()
const ranksFrozen = rkSnap.docs
  .map((d) => {
    const x = d.data()
    const daily = Number(x.dailyReward ?? 0)
    const dur = Number(x.rewardDurationDays ?? x.durationDays ?? 0)
    const storedTotal = Number(x.totalReward ?? 0)
    return {
      id: d.id,
      name: String(x.name ?? ''),
      requiredTeamBusiness: Number(x.requiredTeamBusiness ?? x.teamBiz ?? 0),
      dailyReward: daily,
      rewardDurationDays: dur,
      totalReward: storedTotal > 0 ? storedTotal : daily * dur,
      sortOrder: Number(x.sortOrder ?? x.requiredTeamBusiness ?? 0),
    }
  })
  .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.requiredTeamBusiness - b.requiredTeamBusiness))

console.log('Loading packages catalog…')
const pkgSnap = await db.collection(COL_PACKAGES).get()
const pkgByAmount = new Map()
for (const d of pkgSnap.docs) {
  const x = d.data()
  const minA = Number(x.minAmount ?? 0)
  const maxA = Number(x.maxAmount ?? minA)
  if (minA > 0 && minA === maxA) {
    pkgByAmount.set(minA, { id: d.id, ...x })
  }
}
console.log(`Packages mapped by exact amount: ${[...pkgByAmount.keys()].sort((a, b) => a - b).join(', ')}`)

console.log('Loading users → sponsor map…')
const allUsers = await db.collection(COL_USERS).get()
const sponsorByUid = new Map()
const usernameByUid = new Map()
for (const d of allUsers.docs) {
  const x = d.data()
  sponsorByUid.set(d.id, x.sponsorUid ?? null)
  usernameByUid.set(d.id, String(x.username ?? ''))
}
console.log(`Loaded ${allUsers.size} user docs`)

console.log('Loading usersByUsername index…')
const byUnSnap = await db.collection(COL_USERS_BY_UN).get()
const uidByUsername = new Map()
for (const d of byUnSnap.docs) uidByUsername.set(d.id, d.data()?.uid)
console.log(`Loaded ${byUnSnap.size} usersByUsername entries`)

const records = rows.map((r) => {
  const userid = String(r.USERID).trim()
  const amount = parseMoney(r.AMOUNT)
  const startedAtMillis = parseDate(r.DATE)
  return {
    serial: String(r.SERIAL ?? '').trim(),
    userid,
    fullName: String(r.NAME ?? '').trim(),
    amount,
    startedAtMillis,
  }
})

records.sort((a, b) => a.startedAtMillis - b.startedAtMillis)

console.log('\n=== Pass 1: write activePackages docs ===')
const summary = {
  written: 0,
  skippedMissingUser: 0,
  skippedMissingPackage: 0,
  errors: 0,
}
const writtenPerUser = new Map()

for (const r of records) {
  try {
    const uid = uidByUsername.get(r.userid)
    if (!uid) {
      summary.skippedMissingUser++
      console.warn(`  ! row#${r.serial} USERID=${r.userid} has no usersByUsername entry — skipped`)
      continue
    }
    const pkg = pkgByAmount.get(r.amount)
    if (!pkg) {
      summary.skippedMissingPackage++
      console.warn(`  ! row#${r.serial} amount=$${r.amount} has no matching packages doc — skipped`)
      continue
    }
    const docId = `${TAG}_${r.serial}`
    const startedAtTs = Timestamp.fromMillis(r.startedAtMillis)
    const endsAtTs = Timestamp.fromMillis(r.startedAtMillis + Number(pkg.durationDays) * 86400000)
    const planLabel = String(pkg.packageShelf ?? '').toLowerCase() === 'compounding' ? 'compounding' : 'daily'
    const pkgNwMult = Number(pkg.maxRoiMultiplier ?? 2)
    const frozenNonWorkingCapMultiplier = pkgNwMult > 0 ? pkgNwMult : siteNwMult
    const capturedAt = r.startedAtMillis

    const planSnapshot = {
      schemaVersion: 2,
      capturedAtMillis: capturedAt,
      planSettingsVersionAtCapture: planSettingsVersion,
      packageId: pkg.id,
      packageName: String(pkg.name ?? ''),
      activationAmount: r.amount,
      packageAmount: r.amount,
      roiPercent: Number(pkg.roiPercent ?? 0),
      durationDays: Number(pkg.durationDays ?? 0),
      planType: planLabel,
      nonWorkingMultiplier: frozenNonWorkingCapMultiplier,
      nonWorkingIncomeCapMultiplier: frozenNonWorkingCapMultiplier,
      workingMultiplier: frozenWorkingCapMultiplier,
      workingIncomeCapMultiplier: frozenWorkingCapMultiplier,
      nonWorkingCap: r.amount * Math.max(frozenNonWorkingCapMultiplier, 0),
      workingCap: r.amount * Math.max(frozenWorkingCapMultiplier, 0),
      totalReturnMultiplier: frozenNonWorkingCapMultiplier,
      totalReturnPercent: frozenNonWorkingCapMultiplier * 100,
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

    const apDoc = {
      userId: uid,
      packageId: pkg.id,
      amount: r.amount,
      roiPercent: Number(pkg.roiPercent ?? 0),
      durationDays: Number(pkg.durationDays ?? 0),
      startedAt: startedAtTs,
      endsAt: endsAtTs,
      nonWorkingPaid: 0,
      workingPaid: 0,
      workingIncomeEarned: 0,
      status: 'active',
      planType: planLabel,
      purchasedByUid: uid,
      frozenNonWorkingCapMultiplier,
      frozenWorkingCapMultiplier,
      planSnapshot,
      importedFromExcelRow: r.serial,
      importedAt: Date.now(),
      ...(planLabel === 'compounding' ? { compoundingBalance: r.amount } : {}),
    }

    if (dryRun) {
      console.log(`  [dry] write activePackages/${docId} { user=${r.userid} amount=$${r.amount} pkg=${pkg.name} startedAt=${new Date(r.startedAtMillis).toISOString()} }`)
    } else {
      await db.collection(COL_ACTIVE).doc(docId).set(apDoc)

      await db.collection(COL_USERS).doc(uid).set(
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
    }
    summary.written++
    writtenPerUser.set(uid, (writtenPerUser.get(uid) ?? 0) + 1)
    if (summary.written % 25 === 0) console.log(`  ... ${summary.written} stakes written`)
  } catch (e) {
    summary.errors++
    console.error(`  X row#${r.serial} ${r.userid}:`, e?.message || e)
  }
}
console.log(`Pass 1 done: written=${summary.written}, skippedMissingUser=${summary.skippedMissingUser}, skippedMissingPackage=${summary.skippedMissingPackage}, errors=${summary.errors}`)

console.log('\n=== Pass 2: rebuild upline team counters & activeDirects ===')
const updates = new Map()
function bump(uid, patch) {
  const cur = updates.get(uid) ?? { totalTeamBusiness: 0, powerTeamBusiness: 0, restTeamBusiness: 0, activeDirects: 0 }
  cur.totalTeamBusiness += patch.totalTeamBusiness ?? 0
  cur.powerTeamBusiness += patch.powerTeamBusiness ?? 0
  cur.restTeamBusiness += patch.restTeamBusiness ?? 0
  cur.activeDirects += patch.activeDirects ?? 0
  updates.set(uid, cur)
}

const pFrac = rkPowerPct / 100
const rFrac = rkRestPct / 100

const userHasStake = new Set()
for (const r of records) {
  const uid = uidByUsername.get(r.userid)
  if (!uid) continue
  const pkg = pkgByAmount.get(r.amount)
  if (!pkg) continue

  let cur = uid
  for (let hops = 0; hops < 500; hops++) {
    const sponsor = sponsorByUid.get(cur)
    if (!sponsor) break
    bump(sponsor, {
      totalTeamBusiness: r.amount,
      powerTeamBusiness: r.amount * pFrac,
      restTeamBusiness: r.amount * rFrac,
    })
    cur = sponsor
  }

  if (!userHasStake.has(uid)) {
    userHasStake.add(uid)
    const sponsor = sponsorByUid.get(uid)
    if (sponsor) bump(sponsor, { activeDirects: 1 })
  }
}

console.log(`Upline ancestors that will be updated: ${updates.size}`)

if (dryRun) {
  let i = 0
  for (const [uid, patch] of updates) {
    if (i++ >= 5) break
    console.log(`  [dry] users/${uid} <- ${JSON.stringify(patch)}`)
  }
  console.log(`  [dry] (showing first 5 of ${updates.size})`)
} else {
  console.log('Zeroing out totalTeamBusiness/powerTeamBusiness/restTeamBusiness/activeDirects for ALL 225 users (so re-runs are idempotent)…')
  let zeroBatch = db.batch()
  let zCount = 0
  for (const [uid] of sponsorByUid) {
    zeroBatch.set(
      db.collection(COL_USERS).doc(uid),
      { totalTeamBusiness: 0, powerTeamBusiness: 0, restTeamBusiness: 0, activeDirects: 0, updatedAt: Date.now() },
      { merge: true },
    )
    zCount++
    if (zCount % 400 === 0) {
      await zeroBatch.commit()
      zeroBatch = db.batch()
    }
  }
  if (zCount % 400 !== 0) await zeroBatch.commit()
  console.log(`Zeroed ${zCount} user docs.`)

  console.log('Applying rebuilt counters…')
  let batch = db.batch()
  let i = 0
  for (const [uid, patch] of updates) {
    batch.set(
      db.collection(COL_USERS).doc(uid),
      {
        totalTeamBusiness: Math.round(patch.totalTeamBusiness * 1e6) / 1e6,
        powerTeamBusiness: Math.round(patch.powerTeamBusiness * 1e6) / 1e6,
        restTeamBusiness: Math.round(patch.restTeamBusiness * 1e6) / 1e6,
        activeDirects: patch.activeDirects,
        updatedAt: Date.now(),
      },
      { merge: true },
    )
    i++
    if (i % 400 === 0) {
      await batch.commit()
      batch = db.batch()
    }
  }
  if (i % 400 !== 0) await batch.commit()
  console.log(`Applied counter updates to ${i} ancestor docs.`)
}

console.log('\n=== Summary ===')
console.log(JSON.stringify({
  ...summary,
  uniqueUsersWithStakes: writtenPerUser.size,
  ancestorUpdatesPlanned: updates.size,
  dryRun,
}, null, 2))
console.log(dryRun ? '(dry run — no data was written)' : 'Investment import complete.')
process.exit(0)
