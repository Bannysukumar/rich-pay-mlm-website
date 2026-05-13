import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const pkgs = await db.collection('packages').get()
console.log(`packages collection: ${pkgs.size} doc(s)`)
pkgs.forEach((d) => {
  const p = d.data()
  console.log('  -', d.id, {
    name: p.name,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    roiPercent: p.roiPercent,
    durationDays: p.durationDays,
    active: p.active,
    packageShelf: p.packageShelf,
  })
})

const ap = await db.collection('activePackages').limit(5).get()
console.log(`\nactivePackages: ${ap.size} doc(s) shown of unknown total`)
ap.forEach((d) => console.log('  -', d.id, d.data()))

const apCount = await db.collection('activePackages').count().get()
console.log(`\nactivePackages COUNT: ${apCount.data().count}`)

process.exit(0)
