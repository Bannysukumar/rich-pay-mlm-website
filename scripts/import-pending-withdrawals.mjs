/**
 * Import every row of `admin_exports/Pending Withdrawals.xlsx` into the
 * `withdrawals` collection as PENDING records so they appear under each
 * member's "Withdraw Report" page and in the admin queue.
 *
 * Decisions confirmed with operator:
 *   - status = 'pending'
 *   - bump users/<uid>.totalWithdrawn by the sum of their pending gross
 *     amounts (so Dashboard "Total Withdrawal" reflects legacy state)
 *   - DO NOT debit wallets.cash; legacy already debited and our imported
 *     cash balances already reflect that.
 *
 * Field schema mirrors what `createWithdrawal` writes in functions/src/index.ts:
 *     userId, amountGross, fee, amountNet, address, status,
 *     policySnapshot, createdAt
 *
 * Doc IDs are deterministic: `imp_pwd_<SERIAL>` so re-runs are idempotent.
 *
 * Usage:
 *   node scripts/import-pending-withdrawals.mjs <service-account.json> [--dry-run]
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
  console.error('Usage: node scripts/import-pending-withdrawals.mjs <service-account.json> [--dry-run]')
  process.exit(1)
}
const sa = JSON.parse(fs.readFileSync(path.resolve(keyArg), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()
const { Timestamp, FieldValue } = admin.firestore

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

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE WRITE'} | project: ${sa.project_id}`)

const cfg = await db.collection('siteSettings').doc('config').get()
if (!cfg.exists) throw new Error('siteSettings/config missing')
const settings = cfg.data() ?? {}
const policySnapshot = freezeWithdrawPolicyFromSettings(settings)

const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'Pending Withdrawals.xlsx'))
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter((r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()))
console.log(`Pending withdrawal rows: ${rows.length}\n`)

const summary = { written: 0, missingUser: 0, errors: 0 }
const grossByUid = new Map()
const seenUidByUserid = new Map()

for (const r of rows) {
  const userid = String(r.USERID).trim()
  const serial = String(r.SERIAL ?? '').trim()
  const gross = parseMoney(r.AMOUNT)
  const fee = parseMoney(r['DED.'])
  const net = parseMoney(r.NETT)
  const address = String(r.ADDRESS ?? '').trim()
  const dateMs = parseDate(r.DATE)
  const name = String(r.NAME ?? '').trim()

  console.log(`row#${serial} USERID=${userid} ${name} gross=$${gross} fee=$${fee} net=$${net} addr=${address.slice(0, 10)}… date=${new Date(dateMs).toISOString()}`)

  let uid = seenUidByUserid.get(userid)
  if (!uid) {
    const idx = await db.collection('usersByUsername').doc(userid).get()
    if (!idx.exists) {
      summary.missingUser++
      console.warn(`  ! USERID ${userid} not found — skipped`)
      continue
    }
    uid = idx.data()?.uid
    seenUidByUserid.set(userid, uid)
  }

  const docId = `imp_pwd_${serial}`
  const doc = {
    userId: uid,
    username: userid,
    fullName: name,
    amountGross: gross,
    fee,
    amountNet: net,
    address,
    status: 'pending',
    policySnapshot,
    createdAt: Timestamp.fromMillis(dateMs),
    importedFromExcel: true,
    importedFromSerial: serial,
    importedAt: Date.now(),
  }

  if (dryRun) {
    console.log(`  [dry] would write withdrawals/${docId}`)
  } else {
    try {
      await db.collection('withdrawals').doc(docId).set(doc)
      console.log(`  ✓ wrote withdrawals/${docId}`)
    } catch (e) {
      summary.errors++
      console.error('  X error:', e?.message || e)
      continue
    }
  }
  summary.written++
  grossByUid.set(uid, (grossByUid.get(uid) ?? 0) + gross)
}

console.log(`\nPass 1 done: written=${summary.written}, missingUser=${summary.missingUser}, errors=${summary.errors}`)

console.log('\n=== Pass 2: bump users/<uid>.totalWithdrawn ===')
console.log(`Distinct users to update: ${grossByUid.size}`)
if (dryRun) {
  let n = 0
  for (const [uid, g] of grossByUid) {
    if (n++ >= 5) break
    console.log(`  [dry] users/${uid}.totalWithdrawn += $${g}`)
  }
  console.log(`  [dry] (showing first 5 of ${grossByUid.size})`)
} else {
  let batch = db.batch()
  let i = 0
  for (const [uid, g] of grossByUid) {
    batch.set(
      db.collection('users').doc(uid),
      { totalWithdrawn: FieldValue.increment(g), updatedAt: Date.now() },
      { merge: true },
    )
    i++
    if (i % 400 === 0) {
      await batch.commit()
      batch = db.batch()
    }
  }
  if (i % 400 !== 0) await batch.commit()
  console.log(`Bumped totalWithdrawn on ${i} users.`)
}

console.log('\n=== Summary ===')
console.log(JSON.stringify({ ...summary, distinctUsersBumped: grossByUid.size, dryRun }, null, 2))
console.log(dryRun ? '(dry run — no data was written)' : 'Pending withdrawals import complete.')
process.exit(0)
