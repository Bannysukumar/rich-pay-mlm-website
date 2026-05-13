/**
 * Import every row of `admin_exports/View Deposits.xlsx` into the `deposits`
 * collection as historical, already-approved records so they show up under each
 * member's "Deposit History" page.
 *
 * Decisions confirmed with operator (HISTORY-ONLY mode):
 *   - status = 'approved'
 *   - createdAt = reviewedAt = Excel DATE
 *   - walletCreditApplied = true so a future admin clicking "approve" cannot
 *     double-credit wallets.deposit
 *   - DO NOT touch users/<uid>.wallets.deposit  (funds were already consumed
 *     in the legacy system to activate packages / spend in cash wallet)
 *
 * Doc ID = TXNID directly. The Deposit History UI derives the displayed
 * "Payment ID" from the first 13 alphanumeric chars of the doc ID, so using the
 * raw TXNID makes that column match the spreadsheet exactly.
 *
 * Usage:
 *   node scripts/import-deposits.mjs <service-account.json> [--dry-run]
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
  console.error('Usage: node scripts/import-deposits.mjs <service-account.json> [--dry-run]')
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
const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'View Deposits.xlsx'))
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter((r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()) && String(r.TXNID ?? '').trim())
console.log(`Deposit rows: ${rows.length}\n`)

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
    status: 'approved',
    createdAt: Timestamp.fromMillis(dateMs),
    reviewedAt: Timestamp.fromMillis(dateMs),
    walletCreditApplied: true,
    walletCreditAppliedAt: Timestamp.fromMillis(dateMs),
    txnId,
    fromAddress: address,
    network: 'usdt',
    adminNote: 'Imported from legacy View Deposits.xlsx — wallet credit suppressed (funds already consumed in legacy system)',
    importedFromExcel: true,
    importedFromSerial: String(r.SERIAL ?? '').trim(),
    importedAt: Date.now(),
  }

  if (dryRun) {
    console.log(`  [dry] would write deposits/${txnId}:`, JSON.stringify({ ...doc, createdAt: '<ts>', reviewedAt: '<ts>', walletCreditAppliedAt: '<ts>' }, null, 2))
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
console.log(dryRun ? '(dry run — no data was written)' : 'Deposit import complete.')
process.exit(0)
