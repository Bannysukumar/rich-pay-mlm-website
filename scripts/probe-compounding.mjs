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
    packageShelf: p.packageShelf ?? null,
    maxRoiMultiplier: p.maxRoiMultiplier ?? null,
  })
})

console.log('\n--- Looking for existing imp_inv docs for the 7 compounding rows ---')
const targets = ['imp_inv_7', 'imp_inv_8', 'imp_inv_45', 'imp_inv_46', 'imp_inv_50', 'imp_inv_75', 'imp_inv_122']
for (const id of targets) {
  const d = await db.collection('activePackages').doc(id).get()
  if (!d.exists) {
    console.log(`  ${id}: NOT EXISTS`)
    continue
  }
  const x = d.data()
  console.log(`  ${id}: amount=${x.amount} planType=${x.planType} pkg=${x.planSnapshot?.packageName} startedAt=${x.startedAt?.toDate?.()?.toISOString?.()}`)
}

process.exit(0)
