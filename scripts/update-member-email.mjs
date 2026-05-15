/**
 * Set login email for a member (by username / UserID) in Firebase Auth + Firestore.
 *
 * Usage:
 *   node scripts/update-member-email.mjs <service-account.json> <username-or-uid> <new-email> [--execute]
 *
 * Without --execute: prints resolved uid + current email only.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'

const args = process.argv.slice(2).filter((a) => a !== '--execute')
const EXECUTE = process.argv.includes('--execute')
const [keyPath, rawId, newEmailArg] = args

if (!keyPath || !rawId || !newEmailArg || process.argv.includes('-h')) {
  console.error(
    'Usage: node scripts/update-member-email.mjs <service-account.json> <username-or-uid> <new-email> [--execute]',
  )
  process.exit(1)
}

const newEmail = String(newEmailArg).trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
  console.error('Invalid email')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const auth = admin.auth()

async function resolveUid(identifier) {
  const key = String(identifier).trim().toLowerCase()
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get()
  if (mapSnap.exists) {
    const uid = String(mapSnap.data()?.uid ?? '').trim()
    if (uid) return { uid, usernameKey: key, via: 'usersByUsername' }
  }
  const direct = await db.collection(COL_USERS).doc(String(identifier).trim()).get()
  if (direct.exists) {
    const un = String(direct.data()?.username ?? '').trim().toLowerCase()
    return { uid: direct.id, usernameKey: un || key, via: 'users.docId' }
  }
  throw new Error(`User not found for "${identifier}"`)
}

async function main() {
  const { uid, usernameKey, via } = await resolveUid(rawId)
  const uSnap = await db.collection(COL_USERS).doc(uid).get()
  if (!uSnap.exists) throw new Error('users/{uid} missing')
  const curEmail = String(uSnap.data()?.email ?? '').trim()
  let authEmail = ''
  try {
    const rec = await auth.getUser(uid)
    authEmail = rec.email || ''
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e
  }

  console.log(JSON.stringify({ via, uid, usernameKey, firestoreEmail: curEmail, authEmail, newEmail }, null, 2))

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to apply.')
    return
  }

  let emailOwner = null
  try {
    emailOwner = await auth.getUserByEmail(newEmail)
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e
  }
  if (emailOwner && emailOwner.uid !== uid) {
    throw new Error(`Auth email already in use by uid ${emailOwner.uid}`)
  }

  await auth.updateUser(uid, { email: newEmail })
  const now = Date.now()
  const batch = db.batch()
  batch.update(db.collection(COL_USERS).doc(uid), { email: newEmail, updatedAt: now })
  if (usernameKey) {
    batch.set(db.collection(COL_USERS_BY_UN).doc(usernameKey), { uid, authEmail: newEmail }, { merge: true })
  }
  await batch.commit()
  console.log('\nDone. Auth + Firestore email updated.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
