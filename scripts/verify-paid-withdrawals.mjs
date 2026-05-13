/**
 * Verify the paid-withdrawals import. Compares Firestore state against Excel.
 *
 * Usage: node scripts/verify-paid-withdrawals.mjs <service-account.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORTS_DIR = path.resolve(__dirname, '..', '..', 'admin_exports')

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

function money(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'Withdrawals.xlsx'))
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter((r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()) && String(r.TXHASH ?? '').trim().length > 0)

console.log(`Excel valid rows: ${rows.length}`)

const expectedByUid = new Map()
for (const r of rows) {
  const uid = String(r.USERID).trim()
  const cur = expectedByUid.get(uid) ?? { count: 0, gross: 0 }
  cur.count++
  cur.gross += money(r.AMOUNT)
  expectedByUid.set(uid, cur)
}

console.log('\n=== withdrawals collection counts by status ===')
const statuses = ['pending', 'approved', 'processing', 'paid', 'rejected']
for (const s of statuses) {
  const q = await db.collection('withdrawals').where('status', '==', s).count().get()
  console.log(`  ${s.padEnd(11)}: ${q.data().count}`)
}

const totalQ = await db.collection('withdrawals').count().get()
console.log(`  ${'TOTAL'.padEnd(11)}: ${totalQ.data().count}`)

const paidQ = await db
  .collection('withdrawals')
  .where('status', '==', 'paid')
  .where('importedFromExcel', '==', true)
  .get()
console.log(`\nImported paid docs: ${paidQ.size}`)

let withTx = 0
let withoutTx = 0
let grossSum = 0
for (const d of paidQ.docs) {
  const x = d.data()
  if (String(x.txHash || '').length > 0) withTx++
  else withoutTx++
  grossSum += Number(x.amountGross ?? 0)
}
console.log(`  with txHash: ${withTx}`)
console.log(`  without txHash: ${withoutTx}`)
console.log(`  total gross: $${grossSum.toFixed(2)}`)

console.log('\n=== Spot-check 6 random users ===')
const sample = [...expectedByUid.entries()].sort(() => Math.random() - 0.5).slice(0, 6)
for (const [userid, exp] of sample) {
  const idx = await db.collection('usersByUsername').doc(userid).get()
  const uid = idx.data()?.uid
  if (!uid) {
    console.log(`  USERID=${userid}  uid=NONE`)
    continue
  }
  const userSnap = await db.collection('users').doc(uid).get()
  const u = userSnap.data() ?? {}
  const wAll = await db.collection('withdrawals').where('userId', '==', uid).get()
  const byStatus = new Map()
  let userPaidGross = 0
  for (const w of wAll.docs) {
    const x = w.data()
    byStatus.set(x.status, (byStatus.get(x.status) ?? 0) + 1)
    if (x.status === 'paid') userPaidGross += Number(x.amountGross ?? 0)
  }
  const counts = [...byStatus.entries()].map(([s, n]) => `${s}:${n}`).join(' ')
  console.log(
    `  ${userid}  uid=${uid.slice(0, 8)}…  cash=$${(u.wallets?.cash ?? 0).toFixed(2)}  ` +
      `totalWithdrawn=$${(u.totalWithdrawn ?? 0).toFixed(2)}  ` +
      `withdrawals[${wAll.size}]: ${counts}  ` +
      `expected_paid_rows=${exp.count} ($${exp.gross.toFixed(2)})  ` +
      `actual_paid_gross=$${userPaidGross.toFixed(2)}`,
  )
}

console.log('\nDone.')
process.exit(0)
