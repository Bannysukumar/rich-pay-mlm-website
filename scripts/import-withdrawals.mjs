/**
 * Import every valid row of `admin_exports/Withdrawals.xlsx` (completed
 * payouts) into the `withdrawals` collection as PAID records so they appear
 * under each member's "Withdraw Report" page.
 *
 * Decisions confirmed with operator:
 *   - status = 'paid'
 *   - 26 rows with TXHASH = '.' (legacy manual payouts without on-chain hash)
 *     are still imported, with txHash/txId left as ''. Frontend renders '—'.
 *   - DO NOT debit `wallets.cash`. Imported cash balances already reflect
 *     these legacy debits.
 *   - DO bump `users/<uid>.totalWithdrawn` by gross — but only for rows that
 *     are CREATED for the first time (idempotent on re-run). Existing
 *     withdrawal docs are overwritten with the latest field values.
 *
 * Schema mirrors `createWithdrawal` + `adminWithdrawalUpdate` ('paid' branch)
 * in functions/src/index.ts:
 *     userId, username, fullName, amountGross, fee, amountNet, address,
 *     status, txHash, txId, paidAt, reviewedAt, createdAt, policySnapshot,
 *     importedFromExcel, importedAt
 *
 * Doc IDs are deterministic:
 *   - real on-chain hash rows  -> `imp_wd_<txhash_lower>`
 *   - placeholder '.' rows     -> `imp_wd_norow_<#>`
 *
 * Usage:
 *   node scripts/import-withdrawals.mjs <service-account.json> [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORTS_DIR = path.resolve(__dirname, '..', '..', 'admin_exports')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const keyArg = args.find((a) => !a.startsWith('-'))
if (!keyArg) {
  console.error('Usage: node scripts/import-withdrawals.mjs <service-account.json> [--dry-run]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(path.resolve(keyArg), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()
const { Timestamp, FieldValue } = admin.firestore

function parseDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(s ?? '').trim())
  if (!m) return Date.now()
  const [, dd, mm, yyyy, hh, mi, ap] = m
  let H = Number(hh)
  if (ap) {
    if (ap.toUpperCase() === 'PM' && H !== 12) H += 12
    if (ap.toUpperCase() === 'AM' && H === 12) H = 0
  }
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), H, Number(mi), 0)
}

function parseMoney(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function freezeWithdrawPolicyFromSettings(settings) {
  return {
    withdrawPoliciesVersion: Number(settings.withdrawPoliciesVersion ?? 0),
    withdrawalsEnabled: settings.withdrawalsEnabled !== false,
    withdrawalRequiresActivePackage: settings.withdrawalRequiresActivePackage !== false,
    withdrawNetworkLabel: String(settings.withdrawNetworkLabel ?? settings.depositNetwork ?? 'USDT BEP-20'),
    minWithdrawal: Number(settings.minWithdrawal ?? 10),
    withdrawFeePercent: Number(settings.withdrawFeePercent ?? 10),
    withdrawalWindowStart: String(settings.withdrawalWindowStart ?? '10:30'),
    withdrawalWindowEnd: String(settings.withdrawalWindowEnd ?? '13:30'),
    withdrawalWindowTimezone: String(settings.withdrawalWindowTimezone ?? 'Etc/UTC'),
    withdrawalProcessingIntervalHours: Number(settings.withdrawalProcessingIntervalHours ?? 48),
    withdrawalProcessingMode: String(settings.withdrawalProcessingMode ?? 'manual'),
    withdrawPackageCaps: Array.isArray(settings.withdrawPackageCaps) ? settings.withdrawPackageCaps : [],
    defaultWithdrawalPercentOfPackage: Number(settings.defaultWithdrawalPercentOfPackage ?? 20),
  }
}

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE WRITE'} | project: ${sa.project_id}`)

const cfg = await db.collection('siteSettings').doc('config').get()
if (!cfg.exists) throw new Error('siteSettings/config missing')
const policySnapshot = freezeWithdrawPolicyFromSettings(cfg.data() ?? {})

const wb = XLSX.readFile(path.join(EXPORTS_DIR, 'Withdrawals.xlsx'))
const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
const rows = allRows.filter(
  (r) => /^\d{4,12}$/.test(String(r.USERID ?? '').trim()) && String(r.TXHASH ?? '').trim().length > 0,
)
console.log(`Valid paid withdrawal rows: ${rows.length}\n`)

const summary = {
  created: 0,
  overwritten: 0,
  missingUser: 0,
  errors: 0,
  realHash: 0,
  placeholderHash: 0,
}
const newGrossByUid = new Map()
const uidByUserid = new Map()

for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  const userid = String(r.USERID).trim()
  const serial = String(r['#'] ?? i + 1).trim()
  const rawTx = String(r.TXHASH).trim()
  const isReal = rawTx !== '.' && /^0x[0-9a-fA-F]{6,}$/.test(rawTx)
  const txhash = isReal ? rawTx.toLowerCase() : ''
  const gross = parseMoney(r.AMOUNT)
  const fee = parseMoney(r['DED.'])
  const net = parseMoney(r.NETT)
  const address = String(r.ADDRESS ?? '').trim()
  const dateMs = parseDate(r.DATE)
  const name = String(r.NAME ?? '').trim()
  const mobile = String(r.MOBILE ?? '').trim()

  if (isReal) summary.realHash++
  else summary.placeholderHash++

  let uid = uidByUserid.get(userid)
  if (!uid) {
    const idx = await db.collection('usersByUsername').doc(userid).get()
    if (!idx.exists) {
      summary.missingUser++
      console.warn(`  ! USERID ${userid} not found in usersByUsername — skipped (#${serial})`)
      continue
    }
    uid = idx.data()?.uid
    uidByUserid.set(userid, uid)
  }

  const docId = isReal ? `imp_wd_${txhash}` : `imp_wd_norow_${serial}`
  const ts = Timestamp.fromMillis(dateMs)

  const doc = {
    userId: uid,
    username: userid,
    fullName: name,
    mobile,
    amountGross: gross,
    fee,
    amountNet: net,
    address,
    status: 'paid',
    txHash: txhash,
    txId: txhash,
    paidAt: ts,
    reviewedAt: ts,
    createdAt: ts,
    policySnapshot,
    importedFromExcel: true,
    importedFromSerial: serial,
    importedAt: Date.now(),
  }

  const ref = db.collection('withdrawals').doc(docId)
  const existed = (await ref.get()).exists

  console.log(
    `#${String(serial).padStart(4)} USERID=${userid} ${name.padEnd(22).slice(0, 22)} ` +
      `$${gross.toFixed(2).padStart(7)} ${isReal ? rawTx.slice(0, 12) + '…' : 'NO-TX  '} ` +
      `${new Date(dateMs).toISOString().slice(0, 16)} ` +
      `${existed ? '[existed]' : '[new]'}`,
  )

  if (dryRun) {
    // no write
  } else {
    try {
      await ref.set(doc)
    } catch (e) {
      summary.errors++
      console.error('  X error:', e?.message || e)
      continue
    }
  }

  if (existed) summary.overwritten++
  else {
    summary.created++
    // Only bump totalWithdrawn for newly created docs (idempotent re-runs)
    newGrossByUid.set(uid, (newGrossByUid.get(uid) ?? 0) + gross)
  }
}

console.log(`\nPass 1 done.`)
console.log(JSON.stringify(summary, null, 2))

console.log(`\n=== Pass 2: bump totalWithdrawn for newly created paid withdrawals ===`)
console.log(`Distinct users to bump: ${newGrossByUid.size}`)
if (newGrossByUid.size === 0) {
  console.log('Nothing to bump (no new rows).')
} else if (dryRun) {
  let n = 0
  for (const [uid, g] of newGrossByUid) {
    if (n++ >= 5) break
    console.log(`  [dry] users/${uid}.totalWithdrawn += $${g.toFixed(2)}`)
  }
  if (newGrossByUid.size > 5) console.log(`  [dry] (+${newGrossByUid.size - 5} more)`)
} else {
  let batch = db.batch()
  let i = 0
  for (const [uid, g] of newGrossByUid) {
    batch.set(
      db.collection('users').doc(uid),
      { totalWithdrawn: FieldValue.increment(g), updatedAt: Date.now() },
      { merge: true },
    )
    i++
    if (i % 400 === 0) {
      await batch.commit()
      batch = db.batch()
    }
  }
  if (i % 400 !== 0) await batch.commit()
  console.log(`Bumped totalWithdrawn on ${i} users.`)
}

console.log('\n=== Summary ===')
console.log(
  JSON.stringify(
    { ...summary, distinctUsersBumped: newGrossByUid.size, dryRun },
    null,
    2,
  ),
)
console.log(dryRun ? '(dry run — no data was written)' : 'Paid withdrawals import complete.')
process.exit(0)
