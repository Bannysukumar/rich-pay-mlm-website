import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const cnt = await db.collection('withdrawals').count().get()
console.log('Total withdrawals count:', cnt.data().count)

const byStatus = { pending: 0, processing: 0, approved: 0, rejected: 0, paid: 0, other: 0 }
const sumByStatus = { pending: 0, paid: 0 }
const all = await db.collection('withdrawals').get()
all.forEach((d) => {
  const x = d.data()
  const s = String(x.status ?? '').toLowerCase()
  if (s in byStatus) byStatus[s]++
  else byStatus.other++
  if (s === 'pending') sumByStatus.pending += Number(x.amountGross ?? 0)
})
console.log('Counts by status:', byStatus)
console.log('Pending gross total:', sumByStatus.pending)

const samples = ['3472490', '8013010', '3304104', '8741281', '7926024']
console.log('\nSample user states:')
for (const userid of samples) {
  const idx = await db.collection('usersByUsername').doc(userid).get()
  if (!idx.exists) continue
  const uid = idx.data()?.uid
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}
  const w = await db.collection('withdrawals').where('userId', '==', uid).get()
  console.log(`\nUSERID=${userid} (${u.fullName})  cash=$${u.wallets?.cash ?? 0}  totalWithdrawn=$${u.totalWithdrawn ?? 0}`)
  w.forEach((d) => {
    const x = d.data()
    console.log(`  ${d.id.padEnd(18)} ${String(x.status).padEnd(10)} gross=$${x.amountGross} net=$${x.amountNet} addr=${String(x.address).slice(0, 12)}…`)
  })
}
process.exit(0)
