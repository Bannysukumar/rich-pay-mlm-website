import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const samples = process.argv.slice(3).length ? process.argv.slice(3) : ['6618595', '4448550', '4576019', '4393061', '7400869']

for (const userid of samples) {
  const idx = await db.collection('usersByUsername').doc(userid).get()
  if (!idx.exists) {
    console.log(`USERID ${userid}: NOT FOUND`)
    continue
  }
  const uid = idx.data()?.uid
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}
  const ap = await db.collection('activePackages').where('userId', '==', uid).get()
  let sum = 0
  let maxOne = 0
  const items = []
  ap.forEach((d) => {
    const x = d.data()
    if (String(x.status ?? 'active').toLowerCase() === 'active') {
      sum += Number(x.amount ?? 0)
      maxOne = Math.max(maxOne, Number(x.amount ?? 0))
      items.push({
        id: d.id,
        amount: x.amount,
        startedAt: x.startedAt?.toDate?.()?.toISOString?.() ?? null,
        endsAt: x.endsAt?.toDate?.()?.toISOString?.() ?? null,
        packageName: x.planSnapshot?.packageName,
      })
    }
  })

  console.log(`\n=== USERID ${userid} (${u.fullName}) uid=${uid} ===`)
  console.log(`  active packages: ${ap.size}`)
  console.log(`  YourPackage display: $ ${sum.toFixed(2)} total · max $ ${maxOne.toFixed(2)}`)
  console.log(`  totalTeamBusiness=${u.totalTeamBusiness}, power=${u.powerTeamBusiness}, rest=${u.restTeamBusiness}, activeDirects=${u.activeDirects}`)
  for (const it of items) console.log('   -', it)
}

process.exit(0)
