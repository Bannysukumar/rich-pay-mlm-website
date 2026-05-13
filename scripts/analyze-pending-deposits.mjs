import XLSX from 'xlsx'
import path from 'node:path'
import fs from 'node:fs'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const wb = XLSX.readFile(path.join('..', 'admin_exports', 'Pending Deposits.xlsx'))
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })

function money(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

console.log(`Total rows: ${rows.length}`)
let total = 0
for (const r of rows) total += money(r.AMOUNT)
console.log(`Total pending amount: $${total}`)

const byUid = new Map()
for (const r of rows) {
  const uid = String(r.USERID).trim()
  byUid.set(uid, (byUid.get(uid) ?? 0) + money(r.AMOUNT))
}
console.log(`Unique USERIDs: ${byUid.size}`)

console.log('\nAll rows:')
for (const r of rows) console.log(' ', JSON.stringify(r))

console.log('\nCross-check each USERID current state:')
console.log('USERID    Name                              PendingSum  CurrentDeposit  Activation  Cash    Stakes  ExistingDeposits')
for (const [uid] of byUid) {
  const idx = await db.collection('usersByUsername').doc(uid).get()
  if (!idx.exists) {
    console.log(`${uid}    [USER NOT FOUND]`)
    continue
  }
  const u = (await db.collection('users').doc(idx.data().uid).get()).data() ?? {}
  const ap = await db.collection('activePackages').where('userId', '==', idx.data().uid).get()
  let stakes = 0
  ap.forEach((d) => (stakes += Number(d.data()?.amount ?? 0)))
  const dep = await db.collection('deposits').where('userId', '==', idx.data().uid).get()
  console.log(
    `${uid}    ${String(u.fullName ?? '').slice(0, 30).padEnd(30)}    $${byUid.get(uid).toFixed(0).padStart(5)}     $${String(u.wallets?.deposit ?? 0).padStart(5)}          $${String(u.wallets?.activation ?? 0).padStart(5)}      $${String(u.wallets?.cash ?? 0).padStart(7)}   $${String(stakes).padStart(5)}   ${dep.size}`,
  )
}

process.exit(0)
