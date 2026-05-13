/**
 * Import users from admin_exports/*.xlsx into Firebase Auth + Firestore.
 *
 * Source files (relative to repo root):
 *   ../admin_exports/Members List.xlsx               (225 users, primary roster)
 *   ../admin_exports/Wallet Balance (Cash Wallet).xlsx   (passwords, emails, cash balances)
 *   ../admin_exports/Wallet Balance (Activation Wallet).xlsx (activation balances)
 *
 * Behaviour (decisions confirmed with operator):
 *   - Synthetic auth email = `<USERID>@richpay.local` for every user.
 *   - Password resolution: Cash Wallet > Activation Wallet > USERID itself (fallback).
 *   - On conflict (auth email or usersByUsername entry exists), update Firestore profile
 *     and reset the password.
 *   - Sponsor relationships from Members List "SPONSOR" column are written to
 *     sponsorUsername + sponsorUid (looked up in a second pass).
 *   - counters/usernames.current is bumped to >= max(USERID) at the end.
 *
 * Usage:
 *   node scripts/import-excel-users.mjs <path-to-service-account.json> [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const EXPORTS_DIR = path.resolve(REPO_ROOT, '..', 'admin_exports')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const keyArg = args.find((a) => !a.startsWith('-'))

if (!keyArg) {
  console.error('Usage: node scripts/import-excel-users.mjs <path-to-service-account.json> [--dry-run]')
  process.exit(1)
}

const keyPath = path.resolve(keyArg)
if (!fs.existsSync(keyPath)) {
  console.error('Service account file not found:', keyPath)
  process.exit(1)
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
})

const auth = admin.auth()
const db = admin.firestore()

const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'
const COL_COUNTERS = 'counters'
const EMAIL_DOMAIN = 'richpay.local'

function load(file) {
  const wb = XLSX.readFile(path.join(EXPORTS_DIR, file))
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

function parseMoney(val) {
  if (val == null) return 0
  const s = String(val).replace(/[^0-9.\-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function parseJoined(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(s ?? '').trim())
  if (!m) return Date.now()
  const [, dd, mm, yyyy, hh, mi, ap] = m
  let H = Number(hh)
  if (ap) {
    if (ap.toUpperCase() === 'PM' && H !== 12) H += 12
    if (ap.toUpperCase() === 'AM' && H === 12) H = 0
  }
  const t = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), H, Number(mi), 0)
  return Number.isFinite(t) ? t : Date.now()
}

function validUserId(r) {
  const uid = String(r.USERID ?? '').trim()
  return /^\d{4,12}$/.test(uid)
}

function syntheticEmail(userid) {
  return `${userid}@${EMAIL_DOMAIN}`
}

console.log('Loading source spreadsheets from', EXPORTS_DIR)
const members = load('Members List.xlsx').filter(validUserId)
const cash = load('Wallet Balance (Cash Wallet).xlsx').filter(validUserId)
const act = load('Wallet Balance (Activation Wallet).xlsx').filter(validUserId)

const cashByUid = new Map(cash.map((r) => [String(r.USERID).trim(), r]))
const actByUid = new Map(act.map((r) => [String(r.USERID).trim(), r]))

console.log(`Members: ${members.length} | Cash: ${cashByUid.size} | Activation: ${actByUid.size}`)
console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE WRITE'} | project: ${serviceAccount.project_id}`)
console.log('')

const records = members.map((m) => {
  const userid = String(m.USERID).trim()
  const c = cashByUid.get(userid)
  const a = actByUid.get(userid)
  const password = (c?.PASSWORD && String(c.PASSWORD).trim()) || (a?.PASSWORD && String(a.PASSWORD).trim()) || userid
  const sponsorRaw = String(m.SPONSOR ?? '').trim()
  const sponsorUsername = sponsorRaw && sponsorRaw !== '0' ? sponsorRaw : null
  const fullName = String(m.NAME ?? '').trim() || `Member ${userid}`
  return {
    userid,
    fullName,
    email: syntheticEmail(userid),
    contactEmail: (c?.EMAIL && String(c.EMAIL).trim()) || (a?.EMAIL && String(a.EMAIL).trim()) || '',
    password: String(password),
    sponsorUsername,
    joinedAt: parseJoined(m['JOINED ON']),
    cashWallet: parseMoney(c?.CWALLET ?? m['CASH WALLET']),
    activationWallet: parseMoney(a?.AWALLET ?? m['ACT. WALLET']),
    totalInvestment: parseMoney(m['TOTAL INV.']),
  }
})

records.sort((a, b) => a.joinedAt - b.joinedAt)

const maxUserId = records.reduce((m, r) => Math.max(m, Number(r.userid)), 0)
console.log(`Max USERID across all members: ${maxUserId}`)
console.log('')

const summary = { created: 0, updatedAuth: 0, updatedProfile: 0, sponsorsSet: 0, errors: 0 }

async function upsertAuth(record) {
  const { email, password, fullName, userid } = record
  if (password.length < 6) {
    console.warn(`  ! Password for ${userid} is shorter than 6 chars; padding with zeros.`)
    record.password = String(password).padEnd(6, '0')
  }
  try {
    const existing = await auth.getUserByEmail(email)
    if (dryRun) {
      console.log(`  [dry] would update auth: ${email} (uid=${existing.uid})`)
    } else {
      await auth.updateUser(existing.uid, {
        password: record.password,
        displayName: fullName,
        disabled: false,
      })
    }
    summary.updatedAuth++
    return existing.uid
  } catch (e) {
    if (e?.code === 'auth/user-not-found') {
      if (dryRun) {
        console.log(`  [dry] would create auth: ${email}`)
        return `dry_${userid}`
      }
      const created = await auth.createUser({
        email,
        password: record.password,
        displayName: fullName,
        emailVerified: false,
        disabled: false,
      })
      summary.created++
      return created.uid
    }
    throw e
  }
}

async function writeProfile(record, uid) {
  const now = Date.now()
  const userDoc = {
    username: record.userid,
    email: record.email,
    contactEmail: record.contactEmail || null,
    fullName: record.fullName,
    phone: '',
    sponsorUsername: record.sponsorUsername,
    sponsorUid: null,
    role: 'user',
    wallets: {
      deposit: 0,
      activation: Math.round(record.activationWallet * 1e6) / 1e6,
      cash: Math.round(record.cashWallet * 1e6) / 1e6,
    },
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
    importedFromExcel: true,
    importedTotalInvestment: record.totalInvestment,
    createdAt: record.joinedAt,
    updatedAt: now,
  }

  if (dryRun) {
    console.log(`  [dry] would write users/${uid} { username:${record.userid}, cash:${userDoc.wallets.cash}, act:${userDoc.wallets.activation} } + usersByUsername/${record.userid} { uid:${uid} }`)
    summary.updatedProfile++
    return
  }
  const batch = db.batch()
  batch.set(db.collection(COL_USERS).doc(uid), userDoc, { merge: true })
  batch.set(db.collection(COL_USERS_BY_UN).doc(record.userid), { uid })
  await batch.commit()
  summary.updatedProfile++
}

console.log('=== Pass 1: create/update auth + profile ===')
const uidByUsername = new Map()
for (let i = 0; i < records.length; i++) {
  const r = records[i]
  try {
    const uid = await upsertAuth(r)
    uidByUsername.set(r.userid, uid)
    await writeProfile(r, uid)
    if ((i + 1) % 10 === 0 || i === records.length - 1) {
      console.log(`  ... ${i + 1}/${records.length} done (${r.userid} ${r.fullName})`)
    }
  } catch (e) {
    summary.errors++
    console.error(`  X ${r.userid} (${r.fullName}):`, e?.message || e)
  }
}

console.log('')
console.log('=== Pass 2: wire sponsorUid ===')
for (const r of records) {
  if (!r.sponsorUsername) continue
  const ownUid = uidByUsername.get(r.userid)
  const sponsorUid = uidByUsername.get(r.sponsorUsername)
  if (!ownUid || !sponsorUid) {
    if (!sponsorUid) console.warn(`  ! Sponsor ${r.sponsorUsername} for ${r.userid} not found.`)
    continue
  }
  if (dryRun) {
    console.log(`  [dry] users/${ownUid}.sponsorUid = ${sponsorUid} (sponsor=${r.sponsorUsername})`)
    summary.sponsorsSet++
    continue
  }
  try {
    await db.collection(COL_USERS).doc(ownUid).set({ sponsorUid, updatedAt: Date.now() }, { merge: true })
    summary.sponsorsSet++
  } catch (e) {
    summary.errors++
    console.error(`  X sponsor wiring for ${r.userid}:`, e?.message || e)
  }
}

console.log('')
console.log('=== Pass 3: bump counters/usernames ===')
const counterRef = db.collection(COL_COUNTERS).doc('usernames')
if (dryRun) {
  console.log(`  [dry] would set counters/usernames.current = max(current, ${maxUserId})`)
} else {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = snap.exists ? Number(snap.data()?.current ?? 0) : 0
    const next = Math.max(current, maxUserId)
    tx.set(counterRef, { current: next, importedAt: Date.now() }, { merge: true })
    console.log(`  counters/usernames.current: ${current} -> ${next}`)
  })
}

console.log('')
console.log('=== Summary ===')
console.log(JSON.stringify(summary, null, 2))
console.log(dryRun ? '(dry run — no data was written)' : 'Import complete.')
process.exit(0)
