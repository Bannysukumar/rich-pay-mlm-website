/**
 * Convert the 7 stakes listed in `admin_exports/View Compounding Investments.xlsx`
 * from `planType: 'daily'` into `planType: 'compounding'` in-place.
 *
 * Decisions confirmed with operator:
 *   - These 7 SERIAL numbers refer to the SAME activePackages docs that were
 *     created yesterday (`imp_inv_<SERIAL>`); convert them in place.
 *   - Do NOT seed compounding tier packages catalogue.
 *   - Derive durationDays from Excel: (today + DAYS_REMAINING - startedAt) in days.
 *   - Run live (only 7 docs).
 *
 * For each row this script updates the existing activePackages doc with:
 *     planType = 'compounding'
 *     durationDays = computed
 *     roiPercent = compoundRoiPercentForDoubleInDays(durationDays)
 *     endsAt = today + DAYS_REMAINING
 *     compoundingBalance = amount      (fresh principal-only balance)
 *     nonWorkingPaid = 0               (resets so the new compounding clock starts)
 *     workingPaid    = 0
 *     workingIncomeEarned = 0
 *     planSnapshot.planType            = 'compounding'
 *     planSnapshot.roiAccrualMode      = 'compound_balance'
 *     planSnapshot.durationDays        = computed
 *     planSnapshot.roiPercent          = computed
 *     planSnapshot.packageName         = `Rich Compounding $<amount>`
 *
 * Team business / activeDirects: untouched. Same amount, same upline.
 *
 * Usage:
 *   node scripts/import-compounding.mjs <service-account.json> [--dry-run]
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
  console.error('Usage: node scripts/import-compounding.mjs <service-account.json> [--dry-run]')
  process.exit(1)
}
const sa = JSON.parse(fs.readFileSync(path.resolve(keyArg), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()
const { Timestamp } = admin.firestore

function parseDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(s ?? '').trim())
  if (!m) return Date.now()
  const [, dd, mm, yyyy, hh, mi, ap] = m
  let H = Number(hh)
  if (ap) {
    if (ap.toUpperCase() === 'PM' && H !== 12) H += 12
    if (ap.toUpperCase() === 'AM' && H === 12) H = 0
  }
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), H, Number(mi), 0)
}

function parseMoney(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function compoundRoiPercentForDoubleInDays(days) {
  const n = Math.max(1, Number(days))
  const r = Math.pow(2, 1 / n) - 1
  return Math.round(r * 1e6) / 1e4
}

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE WRITE'} | project: ${sa.project_id}`)

const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'View Compounding Investments.xlsx'))
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter((r) => /^\d+$/.test(String(r.USERID ?? '').trim()))
console.log(`Compounding rows: ${rows.length}`)

const today = Date.now()
const summary = { updated: 0, missing: 0, errors: 0 }

for (const r of rows) {
  const serial = String(r.SERIAL).trim()
  const docId = `imp_inv_${serial}`
  const amount = parseMoney(r.AMOUNT)
  const startedAtMs = parseDate(r.DATE)
  const daysRemainingInt = Number(String(r['DAYS REMAINING'] ?? '0').trim())
  const endsAtMs = today + daysRemainingInt * 86400000
  const durationDays = Math.max(1, Math.round((endsAtMs - startedAtMs) / 86400000))
  const dailyRoiPct = compoundRoiPercentForDoubleInDays(durationDays)

  console.log(
    `\nrow#${serial} USERID=${r.USERID} ${r.NAME} amount=$${amount} ` +
      `started=${new Date(startedAtMs).toISOString()} ` +
      `daysRem=${daysRemainingInt} -> durationDays=${durationDays} dailyRoi=${dailyRoiPct}% endsAt=${new Date(endsAtMs).toISOString()}`,
  )

  const ref = db.collection('activePackages').doc(docId)
  const snap = await ref.get()
  if (!snap.exists) {
    summary.missing++
    console.warn(`  ! activePackages/${docId} does not exist — skipped`)
    continue
  }
  const cur = snap.data() ?? {}
  const planSnapshot = { ...(cur.planSnapshot ?? {}) }
  planSnapshot.planType = 'compounding'
  planSnapshot.roiAccrualMode = 'compound_balance'
  planSnapshot.durationDays = durationDays
  planSnapshot.roiPercent = dailyRoiPct
  planSnapshot.packageName = `Rich Compounding $${amount}`

  const patch = {
    planType: 'compounding',
    durationDays,
    roiPercent: dailyRoiPct,
    endsAt: Timestamp.fromMillis(endsAtMs),
    compoundingBalance: amount,
    nonWorkingPaid: 0,
    workingPaid: 0,
    workingIncomeEarned: 0,
    planSnapshot,
    convertedToCompoundingAt: Date.now(),
    updatedAt: Date.now(),
  }

  if (dryRun) {
    console.log(`  [dry] would patch activePackages/${docId}:`)
    console.log('   ', JSON.stringify({ ...patch, planSnapshot: '<…full…>' }, null, 2))
  } else {
    try {
      await ref.set(patch, { merge: true })
      summary.updated++
      console.log(`  ✓ updated`)
    } catch (e) {
      summary.errors++
      console.error('  X error:', e?.message || e)
    }
  }
}

console.log('\n=== Summary ===')
console.log(JSON.stringify(summary, null, 2))
console.log(dryRun ? '(dry run — no data was written)' : 'Compounding conversion complete.')
process.exit(0)
