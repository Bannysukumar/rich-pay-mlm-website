import XLSX from 'xlsx'
import path from 'node:path'
import fs from 'node:fs'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const wb = XLSX.readFile(path.join('..', 'admin_exports', 'Withdrawals.xlsx'))
const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })

function money(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const valid = all.filter(
  (r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()) && String(r.TXHASH ?? '').trim().length > 0,
)
console.log(`Total raw rows: ${all.length}`)
console.log(`Valid rows (numeric USERID + TXHASH): ${valid.length}`)

let totalGross = 0, totalFee = 0, totalNet = 0
const txhashes = new Map()
const byUid = new Map()
for (const r of valid) {
  const t = String(r.TXHASH).trim().toLowerCase()
  txhashes.set(t, (txhashes.get(t) ?? 0) + 1)
  const uid = String(r.USERID).trim()
  totalGross += money(r.AMOUNT)
  totalFee += money(r['DED.'])
  totalNet += money(r.NETT)
  const cur = byUid.get(uid) ?? { rows: 0, gross: 0 }
  cur.rows++
  cur.gross += money(r.AMOUNT)
  byUid.set(uid, cur)
}

console.log(`Distinct TXHASH count: ${txhashes.size}`)
const dupes = [...txhashes.entries()].filter(([, n]) => n > 1)
console.log(`Duplicate TXHASH entries: ${dupes.length}`)
for (const [t, n] of dupes.slice(0, 10)) console.log(`  ${t} appears ${n}x`)

console.log(`\nTotal GROSS: $${totalGross.toFixed(2)}`)
console.log(`Total FEE:   $${totalFee.toFixed(2)}`)
console.log(`Total NET:   $${totalNet.toFixed(2)}`)
console.log(`Distinct USERIDs in file: ${byUid.size}`)

const top = [...byUid.entries()].sort((a, b) => b[1].gross - a[1].gross).slice(0, 10)
console.log('\nTop 10 users by total gross:')
for (const [uid, agg] of top) console.log(`  ${uid}  rows=${agg.rows}  gross=$${agg.gross.toFixed(2)}`)

console.log('\nChecking which USERIDs are NOT present in Firestore…')
const orphans = []
const presentIds = new Set()
let probed = 0
for (const uid of byUid.keys()) {
  probed++
  const idx = await db.collection('usersByUsername').doc(uid).get()
  if (!idx.exists) orphans.push(uid)
  else presentIds.add(uid)
  if (probed % 50 === 0) console.log(`  ... checked ${probed}/${byUid.size}`)
}
console.log(`Present in Firestore: ${presentIds.size}`)
console.log(`Orphan USERIDs (in Excel but not in Firestore): ${orphans.length}`)
if (orphans.length) console.log(' ', orphans.slice(0, 30).join(', '), orphans.length > 30 ? '...' : '')

let orphanGross = 0
let orphanRows = 0
for (const uid of orphans) {
  const a = byUid.get(uid)
  orphanGross += a.gross
  orphanRows += a.rows
}
console.log(`Orphan rows: ${orphanRows} ($${orphanGross.toFixed(2)})`)
console.log(`Importable rows (USERID exists): ${valid.length - orphanRows} ($${(totalGross - orphanGross).toFixed(2)})`)

process.exit(0)
