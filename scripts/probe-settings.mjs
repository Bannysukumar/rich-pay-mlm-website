import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const cfg = await db.collection('siteSettings').doc('config').get()
console.log('siteSettings/config exists:', cfg.exists)
if (cfg.exists) {
  const d = cfg.data()
  const interesting = {}
  for (const k of [
    'sponsorPercent','teamLevelsCount','nonWorkingIncomeCapMultiplier','workingIncomeCapMultiplier',
    'minWithdrawal','withdrawFeePercent','planSettingsVersion','rankQualificationPowerPercent',
    'rankQualificationRestPercent','stopAllIncomeWhenWorkingCapReached','withdrawPoliciesVersion',
    'withdrawalsEnabled','withdrawalRequiresActivePackage','withdrawNetworkLabel','depositNetwork',
    'withdrawalWindowStart','withdrawalWindowEnd','withdrawalWindowTimezone',
    'withdrawalProcessingIntervalHours','withdrawalProcessingMode','withdrawPackageCaps',
    'defaultWithdrawalPercentOfPackage',
  ]) interesting[k] = d[k]
  console.log(JSON.stringify(interesting, null, 2))
}

const tl = await db.collection('teamLevels').where('active', '==', true).get()
console.log(`\nteamLevels active: ${tl.size}`)
tl.forEach((d) => console.log(' ', d.id, d.data()))

const rk = await db.collection('ranks').where('active', '==', true).get()
console.log(`\nranks active: ${rk.size}`)
rk.forEach((d) => console.log(' ', d.id, d.data()))

process.exit(0)
