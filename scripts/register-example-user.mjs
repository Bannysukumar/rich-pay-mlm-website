/**
 * Create a fully consistent user via callable `registerWithProfile` using the Firebase Admin JSON path
 * only to read project_id (and optionally mint an ID token if the endpoint returns 401 without auth).
 *
 * Usage:
 *   node scripts/register-example-user.mjs path/to/richpay-live-fe3f1-firebase-adminsdk-....json
 *
 * Sponsor ID in this app is the numeric **username** (e.g. 4448550). Use ?ref=USERNAME on Register.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const keyPath = path.resolve(process.argv[2] || '')
if (!keyPath || process.argv.includes('-h')) {
  console.error('Usage: node scripts/register-example-user.mjs <path-to-service-account.json>')
  process.exit(1)
}

const raw = await fs.readFile(keyPath, 'utf8')
/** @type {{ project_id: string }} */
const cred = JSON.parse(raw)
const projectId = cred.project_id
if (!projectId) {
  console.error('Invalid JSON: missing project_id')
  process.exit(1)
}

const region = process.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'
const url = `https://${region}-${projectId}.cloudfunctions.net/registerWithProfile`
const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const phoneDigits = `9${String(Date.now()).slice(-9)}`.slice(0, 12)
const payload = {
  data: {
    email: `example.${uniq}@example.invalid`,
    password: 'ExampleUser1!',
    fullName: 'Example User',
    phone: phoneDigits,
    sponsorUsername: null,
    termsAccepted: true,
  },
}

async function post(headers) {
  return fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

let r = await post({})
let text = await r.text()

if (r.status === 401) {
  const { GoogleAuth } = await import('google-auth-library')
  const auth = new GoogleAuth({ keyFile: keyPath, projectId })
  const client = await auth.getIdTokenClient(url)
  const h = await client.getRequestHeaders()
  let authHeader = ''
  if (h instanceof globalThis.Headers) {
    authHeader = h.get('Authorization') ?? h.get('authorization') ?? ''
  } else {
    const obj = /** @type {Record<string, string>} */ (h)
    authHeader = obj.Authorization ?? obj.authorization ?? ''
  }
  r = await post(authHeader ? { Authorization: authHeader } : {})
  text = await r.text()
}

if (!r.ok) {
  console.error(`HTTP ${r.status}:`, text)
  process.exit(1)
}

let json
try {
  json = JSON.parse(text)
} catch {
  console.error('Non-JSON body:', text)
  process.exit(1)
}

const result = json?.result
const username = result?.username
const uid = result?.uid

if (!username) {
  console.error('Unexpected response:', json)
  process.exit(1)
}

console.log('')
console.log('Created user.')
console.log('  uid:', uid)
console.log('  email:', payload.data.email)
console.log('  password:', payload.data.password)
console.log('')
console.log('SPONSOR ID (use as ?ref= on register or sponsor field):', username)
console.log('')
