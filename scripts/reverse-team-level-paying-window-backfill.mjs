/**
 * Reverse/remove team-level backfill credits created by
 * backfill-team-level-paying-window.mjs (distribution =
 * daily_roi_share_backfill_paying_window).
 *
 * Usage:
 *   node scripts/reverse-team-level-paying-window-backfill.mjs <sa.json>            (dry run)
 *   node scripts/reverse-team-level-paying-window-backfill.mjs <sa.json> --execute
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))
const { FieldValue } = admin.firestore

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute')
const [keyPath] = argv.filter((a) => !a.startsWith('--'))
if (!keyPath) {
  console.error('Usage: node scripts/reverse-team-level-paying-window-backfill.mjs <sa.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

async function main() {
  console.log('Loading backfill teamLevelBonuses…')
  const snap = await db
    .collection('teamLevelBonuses')
    .where('distribution', '==', 'daily_roi_share_backfill_paying_window')
    .get()
  console.log('docs:', snap.size)

  const byUser = new Map()
  let total = 0
  for (const d of snap.docs) {
    const x = d.data()
    const amt = Number(x.amount || 0)
    total += amt
    const uid = String(x.userId || '')
    const cur = byUser.get(uid) || { uid, n: 0, amt: 0 }
    cur.n++
    cur.amt += amt
    byUser.set(uid, cur)
  }

  const rows = []
  for (const [uid, v] of byUser) {
    const u = (await db.collection('users').doc(uid).get()).data() || {}
    rows.push({ username: u.username || uid.slice(0, 8), credits: v.n, total: r2(v.amt) })
  }
  rows.sort((a, b) => b.total - a.total)
  console.log('\n=== TO REMOVE ===')
  console.table([{ docs: snap.size, totalAmount: r2(total), uplines: rows.length }])
  console.table(rows)

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to reverse cash/counters and delete history.')
    return
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < snap.docs.length; i++) {
    const doc = snap.docs[i]
    const x = doc.data()
    const amt = Number(x.amount || 0)
    const uid = String(x.userId || '')
    const pkgId = String(x.activePackageId || '')
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection('teamLevelBonuses').doc(doc.id)
        const cur = await tx.get(ref)
        if (!cur.exists) return
        if (uid) {
          tx.update(db.collection('users').doc(uid), {
            'wallets.cash': FieldValue.increment(-amt),
            workingIncomeBalance: FieldValue.increment(-amt),
            teamLevelCommissionTotal: FieldValue.increment(-amt),
            'userTotals.totalWorkingIncome': FieldValue.increment(-amt),
            updatedAt: Date.now(),
          })
        }
        if (pkgId) {
          tx.set(
            db.collection('activePackages').doc(pkgId),
            {
              workingPaid: FieldValue.increment(-amt),
              workingIncomeEarned: FieldValue.increment(-amt),
              updatedAt: Date.now(),
            },
            { merge: true },
          )
        }
        tx.delete(ref)
      })
      ok++
      if (ok % 50 === 0) console.log(`…reversed ${ok}/${snap.size}`)
    } catch (e) {
      fail++
      console.error('fail', doc.id, e.message || e)
    }
  }

  // Remove related notifications from today if title matches
  const noteSnap = await db
    .collection('notifications')
    .where('title', '==', 'Team level income adjustment')
    .get()
  let notesDeleted = 0
  const batchSize = 400
  let batch = db.batch()
  let inBatch = 0
  for (const d of noteSnap.docs) {
    const body = String(d.data()?.body || '')
    if (!body.includes('paying-day window correction')) continue
    batch.delete(d.ref)
    inBatch++
    notesDeleted++
    if (inBatch >= batchSize) {
      await batch.commit()
      batch = db.batch()
      inBatch = 0
    }
  }
  if (inBatch) await batch.commit()

  await db.collection('auditLogs').add({
    actorUid: 'system:reverse-team-level-paying-window-backfill',
    action: 'reverseBackfillTeamLevelPayingWindow',
    detail: { reversed: ok, failed: fail, totalAmount: r2(total), notificationsDeleted: notesDeleted },
    createdAt: FieldValue.serverTimestamp(),
  })

  console.log(`\nDone. Reversed ${ok}, failed ${fail}, notifications deleted ${notesDeleted}.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
