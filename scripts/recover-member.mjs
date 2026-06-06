/**
 * Recover a member account: ensure Firebase Auth + Firestore mappings, unblock, sync login email.
 *
 * Usage:
 *   node scripts/recover-member.mjs <service-account.json> <username-or-uid> [--execute] [--password <pwd>]
 *
 * Without --execute: dry run only.
 * With --password: also sets Firebase Auth password (min 6 chars; short passwords padded with 0).
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
const LOGIN_DOMAIN = 'richpay.local'

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute')
const passIdx = argv.indexOf('--password')
let newPassword = passIdx >= 0 ? String(argv[passIdx + 1] ?? '') : ''
const filtered = argv.filter((a, i) => {
  if (a === '--execute') return false
  if (passIdx >= 0 && (a === '--password' || i === passIdx + 1)) return false
  return true
})
const [keyPath, rawId] = filtered

if (!keyPath || !rawId || argv.includes('-h')) {
  console.error(
    'Usage: node scripts/recover-member.mjs <service-account.json> <username-or-uid> [--execute] [--password <pwd>]',
  )
  process.exit(1)
}

function normalizePassword(raw) {
  const p = String(raw ?? '')
  return p.length > 0 && p.length < 6 ? p.padEnd(6, '0') : p
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())
}

async function resolveUid(db, identifier) {
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

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const auth = admin.auth()

async function main() {
  const { uid, usernameKey, via } = await resolveUid(db, rawId)
  const uRef = db.collection(COL_USERS).doc(uid)
  const uSnap = await uRef.get()
  if (!uSnap.exists) throw new Error(`users/${uid} missing`)
  const data = uSnap.data()
  const username = String(data.username ?? usernameKey).trim().toLowerCase()
  const fullName = String(data.fullName ?? '').trim()
  const contactEmail = String(data.contactEmail ?? '').trim().toLowerCase()
  const firestoreEmail = String(data.email ?? '').trim().toLowerCase()
  const syntheticEmail = `${username}@${LOGIN_DOMAIN}`
  const preferredLoginEmail = isValidEmail(contactEmail)
    ? contactEmail
    : isValidEmail(firestoreEmail)
      ? firestoreEmail
      : syntheticEmail

  let loginEmail = preferredLoginEmail
  if (loginEmail !== syntheticEmail) {
    try {
      const owner = await auth.getUserByEmail(loginEmail)
      if (owner.uid !== uid) loginEmail = syntheticEmail
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') throw e
    }
  }

  let authUser = null
  try {
    authUser = await auth.getUser(uid)
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e
  }

  const plan = {
    via,
    uid,
    username,
    blocked: Boolean(data.blocked),
    contactEmail: contactEmail || null,
    loginEmail,
    preferredLoginEmail,
    syntheticEmail,
    authExists: Boolean(authUser),
    authEmail: authUser?.email ?? null,
    authDisabled: authUser?.disabled ?? null,
    willSetPassword: Boolean(newPassword),
  }

  console.log(JSON.stringify(plan, null, 2))

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to apply.')
    if (!authUser) {
      console.log('Auth user missing — execute will recreate Auth with the same uid.')
    }
    return
  }

  newPassword = normalizePassword(newPassword)

  if (!authUser) {
    await auth.createUser({
      uid,
      email: loginEmail,
      displayName: fullName || username,
      disabled: false,
      emailVerified: false,
      ...(newPassword ? { password: newPassword } : {}),
    })
    console.log('Created Firebase Auth user.')
  } else {
    const patch = {
      email: loginEmail,
      disabled: false,
      displayName: fullName || authUser.displayName || username,
    }
    if (newPassword) patch.password = newPassword
    await auth.updateUser(uid, patch)
    console.log('Updated Firebase Auth user.')
  }

  const now = Date.now()
  const batch = db.batch()
  batch.set(
    uRef,
    {
      blocked: false,
      email: loginEmail,
      updatedAt: now,
    },
    { merge: true },
  )
  if (username) {
    const mapPatch = { uid }
    if (loginEmail !== syntheticEmail) mapPatch.authEmail = loginEmail
    batch.set(db.collection(COL_USERS_BY_UN).doc(username), mapPatch, { merge: true })
    if (loginEmail === syntheticEmail) {
      batch.update(db.collection(COL_USERS_BY_UN).doc(username), {
        authEmail: admin.firestore.FieldValue.delete(),
      })
    }
  }
  await batch.commit()
  console.log('Firestore profile unblocked and username mapping refreshed.')

  if (newPassword) {
    await auth.revokeRefreshTokens(uid)
    await uRef.set(
      {
        authSessionVersion: admin.firestore.FieldValue.increment(1),
        updatedAt: Date.now(),
      },
      { merge: true },
    )
    console.log('Other login sessions revoked for this member.')
  }

  try {
    const resetLink = await auth.generatePasswordResetLink(loginEmail)
    console.log('\nPassword reset link (send to member if needed):')
    console.log(resetLink)
  } catch (e) {
    console.warn('Could not generate password reset link:', e?.message || e)
  }

  if (newPassword) {
    console.log(`\nPassword set. Member can sign in with UserID ${username} and the provided password.`)
  } else {
    console.log(`\nMember can sign in with UserID ${username} (login email ${loginEmail}). Use forgot password if needed.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
