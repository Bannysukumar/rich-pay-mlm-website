/**
 * Import every row of `admin_exports/Pending Deposits.xlsx` into the `deposits`
 * collection as PENDING records so they appear under each member's "View QR"
 * page and in the admin "Pending Deposits" queue.
 *
 * Decisions confirmed with operator (SAFE mode):
 *   - status = 'pending'
 *   - walletCreditApplied = true        ← critical safety flag
 *
 * The `adminFinalizeDeposit` callable contains this branch:
 *
 *     if (cur === 'pending' && alreadyCredited) {
 *       tx.update(depRef, { status: 'approved', ... })
 *       return 0
 *     }
 *
 * so when the admin eventually approves an imported pending deposit, the doc
 * simply flips to status='approved' WITHOUT incrementing wallets.deposit.
 * Legacy funds were already consumed in the previous system to fund stakes /
 * cash balances; re-crediting would double-spend.
 *
 * Doc ID = TXNID directly so the front-end's paymentIdFromDocId() exposes the
 * raw TXNID exactly as the displayed Payment ID.
 *
 * Usage:
 *   node scripts/import-pending-deposits.mjs <service-account.json> [--dry-run]
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
  console.error('Usage: node scripts/import-pending-deposits.mjs <service-account.json> [--dry-run]')
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

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE WRITE'} | project: ${sa.project_id}`)
const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'Pending Deposits.xlsx'))
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter((r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()) && String(r.TXNID ?? '').trim())
console.log(`Pending deposit rows: ${rows.length}\n`)

const summary = { written: 0, missingUser: 0, errors: 0 }

for (const r of rows) {
  const userid = String(r.USERID).trim()
  const txnId = String(r.TXNID).trim()
  const amount = parseMoney(r.AMOUNT)
  const dateMs = parseDate(r.DATE)
  const address = String(r.ADDRESS ?? '').trim()
  const name = String(r.NAME ?? '').trim()

  console.log(`row#${r.SERIAL} USERID=${userid} ${name} amount=$${amount} txnId=${txnId} date=${new Date(dateMs).toISOString()}`)

  const idx = await db.collection('usersByUsername').doc(userid).get()
  if (!idx.exists) {
    summary.missingUser++
    console.warn(`  ! USERID ${userid} not found — skipped`)
    continue
  }
  const uid = idx.data()?.uid

  const doc = {
    userId: uid,
    username: userid,
    fullName: name,
    amount,
    status: 'pending',
    createdAt: Timestamp.fromMillis(dateMs),
    walletCreditApplied: true,
    walletCreditAppliedAt: Timestamp.fromMillis(dateMs),
    txnId,
    fromAddress: address,
    network: 'usdt',
    adminNote:
      'Imported from legacy Pending Deposits.xlsx — walletCreditApplied flag pre-set so admin approval will NOT credit wallets.deposit (funds already consumed in legacy system).',
    importedFromExcel: true,
    importedFromSerial: String(r.SERIAL ?? '').trim(),
    importedAt: Date.now(),
  }

  if (dryRun) {
    console.log(`  [dry] would write deposits/${txnId}:`)
    console.log('   ', JSON.stringify({ ...doc, createdAt: '<ts>', walletCreditAppliedAt: '<ts>' }, null, 2))
    summary.written++
    continue
  }

  try {
    await db.collection('deposits').doc(txnId).set(doc)
    summary.written++
    console.log(`  ✓ wrote deposits/${txnId}`)
  } catch (e) {
    summary.errors++
    console.error('  X error:', e?.message || e)
  }
}

console.log('\n=== Summary ===')
console.log(JSON.stringify(summary, null, 2))
console.log(dryRun ? '(dry run — no data was written)' : 'Pending deposits import complete.')
process.exit(0)
