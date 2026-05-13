import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const cnt = await db.collection('deposits').count().get()
console.log('Total deposits collection count:', cnt.data().count)

const byStatus = { pending: 0, approved: 0, rejected: 0, other: 0 }
const totalAmountByStatus = { pending: 0, approved: 0, rejected: 0 }
const all = await db.collection('deposits').get()
all.forEach((d) => {
  const x = d.data()
  const s = String(x.status ?? '').toLowerCase()
  if (s === 'pending') {
    byStatus.pending++
    totalAmountByStatus.pending += Number(x.amount ?? 0)
  } else if (s === 'approved') {
    byStatus.approved++
    totalAmountByStatus.approved += Number(x.amount ?? 0)
  } else if (s === 'rejected') {
    byStatus.rejected++
    totalAmountByStatus.rejected += Number(x.amount ?? 0)
  } else byStatus.other++
})
console.log('Counts by status:', byStatus)
console.log('Totals $ by status:', totalAmountByStatus)

const samples = ['8921074', '2924523', '3304104', '4448550', '6618595']
console.log('\nSample user deposit histories:')
for (const userid of samples) {
  const idx = await db.collection('usersByUsername').doc(userid).get()
  if (!idx.exists) continue
  const uid = idx.data()?.uid
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}
  const dep = await db
    .collection('deposits')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get()
  console.log(`\nUSERID ${userid} (${u.fullName}) wallets.deposit=${u.wallets?.deposit ?? 0}`)
  dep.forEach((d) => {
    const x = d.data()
    console.log(`  ${d.id.padEnd(15)} ${String(x.status).padEnd(8)} $${String(x.amount).padStart(6)} walletCreditApplied=${x.walletCreditApplied} ${x.createdAt?.toDate?.()?.toISOString?.()}`)
  })
}

process.exit(0)
