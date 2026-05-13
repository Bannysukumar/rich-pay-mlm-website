import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const samples = ['4545712', '3304104', '1932641']

for (const userid of samples) {
  const idx = await db.collection('usersByUsername').doc(userid).get()
  if (!idx.exists) {
    console.log(`USERID ${userid}: NOT FOUND`)
    continue
  }
  const uid = idx.data()?.uid
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}
  const ap = await db.collection('activePackages').where('userId', '==', uid).get()
  let stakes = 0
  ap.forEach((d) => (stakes += Number(d.data()?.amount ?? 0)))
  const dep = await db.collection('deposits').where('userId', '==', uid).get()
  console.log(`\nUSERID=${userid} ${u.fullName}  uid=${uid}`)
  console.log('  wallets:', u.wallets)
  console.log('  totalWithdrawn:', u.totalWithdrawn)
  console.log('  active packages count:', ap.size, 'sum:', stakes)
  console.log('  existing deposits collection rows for this user:', dep.size)
  dep.forEach((d) => console.log('   ', d.id, d.data()))
}

process.exit(0)
