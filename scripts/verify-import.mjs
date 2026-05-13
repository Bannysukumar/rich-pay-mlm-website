/**
 * Verify a freshly imported user:
 *   1. Admin: read Firestore profile + auth record by synthetic email.
 *   2. REST: attempt Firebase Auth signInWithPassword to confirm the password works.
 *
 * Usage:
 *   node scripts/verify-import.mjs <service-account.json> <USERID> <PASSWORD>
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import admin from 'firebase-admin'

const [keyArg, userid, password] = process.argv.slice(2)
if (!keyArg || !userid || !password) {
  console.error('Usage: node scripts/verify-import.mjs <service-account.json> <USERID> <PASSWORD>')
  process.exit(1)
}
const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(keyArg), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })

const email = `${userid}@richpay.local`

const userRec = await admin.auth().getUserByEmail(email)
console.log('Auth user:', { uid: userRec.uid, email: userRec.email, displayName: userRec.displayName })

const uSnap = await admin.firestore().collection('users').doc(userRec.uid).get()
const u = uSnap.data() ?? {}
console.log('Firestore users/<uid>:', {
  username: u.username,
  fullName: u.fullName,
  sponsorUsername: u.sponsorUsername,
  sponsorUid: u.sponsorUid,
  wallets: u.wallets,
  importedTotalInvestment: u.importedTotalInvestment,
})

const unSnap = await admin.firestore().collection('usersByUsername').doc(userid).get()
console.log('usersByUsername/<USERID>:', unSnap.data())

const webApiKey = process.env.FIREBASE_WEB_API_KEY
if (!webApiKey) {
  console.log('\n(set FIREBASE_WEB_API_KEY env var to additionally test REST sign-in)')
  process.exit(0)
}

const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
})
const j = await r.json()
console.log('\nREST signInWithPassword:', r.status, j.localId ? '✓ signed in as ' + j.localId : j.error)
