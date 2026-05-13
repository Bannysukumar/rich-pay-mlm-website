import XLSX from 'xlsx'
import path from 'node:path'
import fs from 'node:fs'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const wb = XLSX.readFile(path.join('..', 'admin_exports', 'Pending Withdrawals.xlsx'))
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })

function money(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const valid = rows.filter((r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()))
console.log(`Valid rows: ${valid.length}`)

let totalGross = 0, totalFee = 0, totalNet = 0
const byUid = new Map()
const orphans = []
for (const r of valid) {
  const uid = String(r.USERID).trim()
  const gross = money(r.AMOUNT)
  const fee = money(r['DED.'])
  const net = money(r.NETT)
  totalGross += gross
  totalFee += fee
  totalNet += net
  const cur = byUid.get(uid) ?? { rows: 0, gross: 0 }
  cur.rows++
  cur.gross += gross
  byUid.set(uid, cur)
}

console.log(`Total gross requested: $${totalGross}`)
console.log(`Total fees: $${totalFee}`)
console.log(`Total net (to be paid out): $${totalNet}`)
console.log(`Unique users with pending withdrawals: ${byUid.size}`)

console.log('\nCross-check current state per user:')
console.log('USERID    Name                              PendingGross  cash      activation  totalWithdrawn  stakes')
for (const [uid, agg] of byUid) {
  const idx = await db.collection('usersByUsername').doc(uid).get()
  if (!idx.exists) {
    orphans.push(uid)
    console.log(`${uid}    [NOT FOUND]`)
    continue
  }
  const u = (await db.collection('users').doc(idx.data().uid).get()).data() ?? {}
  const ap = await db.collection('activePackages').where('userId', '==', idx.data().uid).get()
  let stakes = 0
  ap.forEach((d) => (stakes += Number(d.data()?.amount ?? 0)))
  console.log(
    `${uid}    ${String(u.fullName ?? '').slice(0, 30).padEnd(30)}    $${String(agg.gross).padStart(7)}   $${String(u.wallets?.cash ?? 0).padStart(7)}   $${String(u.wallets?.activation ?? 0).padStart(6)}    $${String(u.totalWithdrawn ?? 0).padStart(7)}      $${String(stakes).padStart(5)}`,
  )
}
console.log('\nOrphans (USERIDs in Excel but no user doc):', orphans)
process.exit(0)
