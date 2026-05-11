/**
 * Create or promote an admin: Firebase Auth + Firestore `users` + `usersByUsername` + `phoneIndex`.
 *
 * Usage:
 *   node scripts/create-admin-user.mjs <path-to-service-account.json> <email> <username> <password>
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const [, , keyPath, emailArg, usernameArg, passwordArg] = process.argv

if (!keyPath || !emailArg || !usernameArg || !passwordArg || process.argv.includes('-h')) {
  console.error(
    'Usage: node scripts/create-admin-user.mjs <service-account.json> <email> <username> <password>',
  )
  process.exit(1)
}

if (keyPath.includes('<') || keyPath.includes('>')) {
  console.error(
    'Pass the real JSON file path (not a placeholder). Example: ..\\..\\richpay-live-fe3f1-firebase-adminsdk-fbsvc-a9082953e1.json',
  )
  process.exit(1)
}

const email = String(emailArg).trim().toLowerCase()
const username = String(usernameArg).trim()
const password = String(passwordArg)

if (password.length < 6) {
  console.error('Firebase Auth requires password length >= 6.')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const auth = admin.auth()

const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'
const COL_PHONE = 'phoneIndex'

const adminPhone = `91${username.replace(/\D/g, '').padStart(9, '0').slice(-9)}`

function baseUserDoc(now) {
  return {
    username,
    email,
    fullName: 'Administrator',
    phone: adminPhone,
    sponsorUsername: null,
    sponsorUid: null,
    role: 'admin',
    wallets: { deposit: 0, activation: 0, cash: 0 },
    totalWithdrawn: 0,
    activeDirects: 0,
    currentRank: '—',
    totalTeamBusiness: 0,
    powerTeamBusiness: 0,
    restTeamBusiness: 0,
    rankRewardActive: false,
    rankRewardDaysPaid: 0,
    rankRewardTotalDays: 0,
    rankRewardDailyAmount: 0,
    rankRewardRankId: '',
    rankRewardRankName: '',
    rankRewardLastPaidDayKey: '',
    completedRankRewardIds: [],
    nonWorkingIncomeBalance: 0,
    workingIncomeBalance: 0,
    sponsorBonusTotal: 0,
    dailyProfitsTotal: 0,
    teamLevelCommissionTotal: 0,
    rankCommissionTotal: 0,
    userTotals: { totalWorkingIncome: 0 },
    createdAt: now,
    updatedAt: now,
  }
}

async function main() {
  let byEmail = null
  try {
    byEmail = await auth.getUserByEmail(email)
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e
  }

  const mapRef = db.collection(COL_USERS_BY_UN).doc(username)
  const mapSnap = await mapRef.get()
  let byUnUid = null
  if (mapSnap.exists) {
    byUnUid = String(mapSnap.data()?.uid || '')
    if (!byUnUid) {
      console.error(`usersByUsername/${username} exists but has no uid`)
      process.exit(1)
    }
  }

  if (byEmail && byUnUid && byEmail.uid !== byUnUid) {
    console.error(
      `Conflict: email ${email} is uid ${byEmail.uid} but usersByUsername/${username} is uid ${byUnUid}. Resolve manually.`,
    )
    process.exit(1)
  }

  const uid = byEmail?.uid || byUnUid
  let userRecord

  if (!uid) {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: 'Administrator',
    })
    console.log(`Created Auth user uid ${userRecord.uid}`)
  } else {
    await auth.updateUser(uid, { email, password, displayName: 'Administrator' })
    userRecord = await auth.getUser(uid)
    console.log(`Updated Auth user uid ${uid}`)
  }

  const finalUid = userRecord.uid
  const userRef = db.collection(COL_USERS).doc(finalUid)
  const existing = await userRef.get()
  const now = Date.now()
  const phoneRef = db.collection(COL_PHONE).doc(adminPhone)
  const phoneSnap = await phoneRef.get()
  if (phoneSnap.exists && String(phoneSnap.data()?.uid || '') !== finalUid) {
    console.error(`phoneIndex/${adminPhone} already used by another uid`)
    process.exit(1)
  }

  const doc = existing.exists
    ? {
        ...existing.data(),
        username,
        email,
        fullName: 'Administrator',
        phone: adminPhone,
        role: 'admin',
        sponsorUsername: null,
        sponsorUid: null,
        updatedAt: now,
      }
    : baseUserDoc(now)

  const batch = db.batch()
  batch.set(userRef, doc, { merge: true })
  batch.set(mapRef, { uid: finalUid, authEmail: email }, { merge: true })
  batch.set(phoneRef, { uid: finalUid }, { merge: true })
  await batch.commit()

  await auth.setCustomUserClaims(finalUid, { admin: true })

  console.log('')
  console.log('Done. Admin user ready.')
  console.log('  uid:', finalUid)
  console.log('  Firestore username:', username)
  console.log('  Auth email (use on login page):', email)
  console.log('  Custom claim: admin=true')
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
