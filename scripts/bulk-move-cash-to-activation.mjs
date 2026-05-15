/**
 * Move every user's full **cash wallet** balance into the **activation wallet**
 * (`wallets.cash` → 0, `wallets.activation` += cash). Firestore only.
 *
 * Usage:
 *   node scripts/bulk-move-cash-to-activation.mjs <service-account.json> [--execute]
 *
 * Without --execute: counts users with cash > 0 and total USDT (no writes).
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

const args = process.argv.slice(2).filter((a) => a !== '--execute')
const EXECUTE = process.argv.includes('--execute')
const [keyPath] = args

if (!keyPath || process.argv.includes('-h')) {
  console.error('Usage: node scripts/bulk-move-cash-to-activation.mjs <service-account.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const { FieldValue, FieldPath } = admin.firestore

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function readCash(data) {
  const w = data?.wallets
  if (!w || typeof w !== 'object') return 0
  const c = Number(w.cash ?? 0)
  return Number.isFinite(c) ? c : 0
}

async function main() {
  let last = null
  let scanned = 0
  let withCash = 0
  let skippedNegative = 0
  let totalCash = 0
  const moves = []

  for (;;) {
    let q = db.collection(COL_USERS).orderBy(FieldPath.documentId()).limit(400)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break

    for (const d of snap.docs) {
      scanned++
      const cash = readCash(d.data())
      if (cash < -1e-9) {
        skippedNegative++
        continue
      }
      if (cash <= 1e-9) continue
      withCash++
      totalCash += cash
      moves.push({ ref: d.ref, uid: d.id, cash })
    }
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < 400) break
  }

  console.log(
    JSON.stringify(
      {
        scannedUsers: scanned,
        usersWithPositiveCash: withCash,
        skippedNegativeCashWallet: skippedNegative,
        totalCashToMoveUsdt: Math.round(totalCash * 1e6) / 1e6,
      },
      null,
      2,
    ),
  )

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to apply updates.')
    return
  }

  if (moves.length === 0) {
    console.log('Nothing to update.')
    return
  }

  const now = Date.now()
  let batches = 0
  for (const part of chunkArray(moves, 400)) {
    const batch = db.batch()
    for (const { ref, cash } of part) {
      batch.update(ref, {
        'wallets.cash': 0,
        'wallets.activation': FieldValue.increment(cash),
        updatedAt: now,
      })
    }
    await batch.commit()
    batches++
  }

  console.log('\nDone.', JSON.stringify({ updateBatches: batches, usersUpdated: moves.length }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
