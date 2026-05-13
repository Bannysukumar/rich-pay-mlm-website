/**
 * Read-only verifier for `admin_exports/Wallet Balance (Activation Wallet).xlsx`.
 *
 * For each row in the sheet:
 *   1. Resolve the user via usersByUsername/<USERID> -> users/<uid>
 *   2. Compare wallets.activation against AWALLET from the sheet
 *   3. Report exact match / mismatch / missing user
 *
 * No writes are performed.
 *
 * Usage:
 *   node scripts/verify-activation-wallet.mjs <path-to-service-account.json>
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORTS_DIR = path.resolve(__dirname, '..', '..', 'admin_exports')

const keyArg = process.argv[2]
if (!keyArg) {
  console.error('Usage: node scripts/verify-activation-wallet.mjs <service-account.json>')
  process.exit(1)
}
const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(keyArg), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
const db = admin.firestore()

function parseMoney(val) {
  if (val == null) return 0
  const s = String(val).replace(/[^0-9.\-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function validUserId(r) {
  return /^\d{4,12}$/.test(String(r.USERID ?? '').trim())
}

const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'Wallet Balance (Activation Wallet).xlsx'))
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: null }).filter(validUserId)
console.log(`Loaded ${rows.length} activation-wallet rows from spreadsheet`)
console.log(`Project: ${serviceAccount.project_id}\n`)

let exactMatch = 0
let mismatch = 0
let missing = 0
const mismatches = []
const missingUsers = []

for (const r of rows) {
  const userid = String(r.USERID).trim()
  const expected = parseMoney(r.AWALLET)
  const idxSnap = await db.collection('usersByUsername').doc(userid).get()
  if (!idxSnap.exists) {
    missing++
    missingUsers.push({ userid, name: r.NAME, expected })
    console.log(`  MISSING  ${userid.padEnd(8)} ${String(r.NAME ?? '').padEnd(22)} expected=${expected}  (no usersByUsername entry)`)
    continue
  }
  const uid = idxSnap.data()?.uid
  const uSnap = await db.collection('users').doc(uid).get()
  if (!uSnap.exists) {
    missing++
    missingUsers.push({ userid, name: r.NAME, expected, note: 'usersByUsername entry exists but users/<uid> missing' })
    console.log(`  MISSING  ${userid.padEnd(8)} ${String(r.NAME ?? '').padEnd(22)} expected=${expected}  (users/${uid} missing)`)
    continue
  }
  const u = uSnap.data() ?? {}
  const actual = Number(u.wallets?.activation ?? 0)
  const diff = Math.abs(actual - expected)
  if (diff < 0.005) {
    exactMatch++
    console.log(`  OK       ${userid.padEnd(8)} ${String(r.NAME ?? '').padEnd(22)} activation=${actual}`)
  } else {
    mismatch++
    mismatches.push({ userid, name: r.NAME, expected, actual, diff: actual - expected })
    console.log(`  MISMATCH ${userid.padEnd(8)} ${String(r.NAME ?? '').padEnd(22)} expected=${expected}  actual=${actual}  (diff ${(actual - expected).toFixed(4)})`)
  }
}

console.log('\n=== Summary ===')
console.log(`  Exact matches : ${exactMatch}`)
console.log(`  Mismatches    : ${mismatch}`)
console.log(`  Missing users : ${missing}`)
if (mismatches.length) {
  console.log('\n  Mismatches details:')
  for (const m of mismatches) console.log('   ', m)
}
if (missingUsers.length) {
  console.log('\n  Missing user details:')
  for (const m of missingUsers) console.log('   ', m)
}
console.log(mismatch === 0 && missing === 0 ? '\nAll activation wallets match the spreadsheet.' : '\nDiscrepancies found.')
process.exit(0)
