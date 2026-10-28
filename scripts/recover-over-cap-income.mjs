/**
 * Recover income paid above the 3× cap (ROI 2× + working 1×) from members' cash wallets.
 * Cash may go negative. Writes a cash-wallet history row (walletTransactions) with the reason,
 * a member notification, and an `adminAdjustMemberBalances` audit row for the admin report.
 * Idempotent per member (walletTransactions doc id `incomecap3x_<uid>`).
 *
 * Extra = min(ROI on active packages + lifetime working − Σ active stake × 3,
 *             lifetime ROI + lifetime working − Σ all stakes × 3)
 *
 * Usage:
 *   node scripts/recover-over-cap-income.mjs <service-account.json>            (dry run)
 *   node scripts/recover-over-cap-income.mjs <service-account.json> --execute
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
  console.error('Usage: node scripts/recover-over-cap-income.mjs <service-account.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const usd = (n) => `$${r2(n).toFixed(2)}`

async function main() {
  const apSnap = await db.collection('activePackages').get()
  const byUser = new Map()
  for (const d of apSnap.docs) {
    const x = d.data()
    const uid = String(x.userId ?? '')
    const amt = Number(x.amount ?? 0)
    const nw = Number(x.frozenNonWorkingCapMultiplier ?? x.planSnapshot?.nonWorkingIncomeCapMultiplier ?? 2)
    const w = Number(x.frozenWorkingCapMultiplier ?? x.planSnapshot?.workingIncomeCapMultiplier ?? 1)
    const paid = Number(x.nonWorkingPaid ?? 0)
    const u = byUser.get(uid) ?? { aStake: 0, aCap: 0, aRoi: 0, allStake: 0, allRoi: 0 }
    u.allStake += amt
    u.allRoi += paid
    if (x.status === 'active') {
      u.aStake += amt
      u.aCap += amt * (nw + w)
      u.aRoi += paid
    }
    byUser.set(uid, u)
  }

  const plan = []
  const usersSnap = await db.collection('users').get()
  for (const us of usersSnap.docs) {
    const p = byUser.get(us.id)
    if (!p || p.aStake <= 0) continue
    const u = us.data()
    const working = Number(u.userTotals?.totalWorkingIncome ?? 0)
    const total = p.aRoi + working
    const extraActive = total - p.aCap
    const extraLifetime = p.allRoi + working - p.allStake * 3
    const extra = r2(Math.min(extraActive, extraLifetime))
    if (extra <= 0.01) continue
    const cash = Number(u.wallets?.cash ?? 0)
    plan.push({
      uid: us.id,
      username: u.username ?? '(deleted)',
      stake: p.aStake,
      roi: r2(p.aRoi),
      working: r2(working),
      total: r2(total),
      cap3x: r2(p.aCap),
      extra,
      cashBefore: r2(cash),
      cashAfter: r2(cash - extra),
    })
  }

  console.table(plan.map(({ uid, ...rest }) => ({ uid: uid.slice(0, 6), ...rest })))
  console.log(`Total to recover: ${usd(plan.reduce((s, r) => s + r.extra, 0))}`)

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to apply.')
    return
  }

  for (const r of plan) {
    const userRef = db.collection('users').doc(r.uid)
    const txRef = db.collection('walletTransactions').doc(`incomecap3x_${r.uid}`)
    const details =
      `Your package of ${usd(r.stake)} has a 3x income limit of ${usd(r.cap3x)} ` +
      `(2x ROI + 1x referral & level income). You received ${usd(r.total)} ` +
      `(ROI ${usd(r.roi)} + referral/level/rank ${usd(r.working)}), so the extra ${usd(r.extra)} was removed.`

    const applied = await db.runTransaction(async (tx) => {
      const existing = await tx.get(txRef)
      if (existing.exists) return false
      const snap = await tx.get(userRef)
      const cash = Number(snap.data()?.wallets?.cash ?? 0)
      tx.update(userRef, { 'wallets.cash': FieldValue.increment(-r.extra), updatedAt: Date.now() })
      tx.set(txRef, {
        userId: r.uid,
        wallet: 'cash',
        type: 'income_cap_adjustment',
        description: 'Income limit adjustment (3x)',
        details,
        credit: 0,
        debit: r.extra,
        balanceAfter: r2(cash - r.extra),
        createdAt: FieldValue.serverTimestamp(),
      })
      return true
    })
    if (!applied) {
      console.log(`${r.username}: already adjusted, skipped`)
      continue
    }
    await db.collection('notifications').add({
      userId: r.uid,
      title: 'Income limit adjustment',
      body: details,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    })
    await db.collection('auditLogs').add({
      actorUid: 'system:income-cap-3x',
      action: 'adminAdjustMemberBalances',
      detail: { userId: r.uid, field: 'wallet_cash', delta: -r.extra, reason: details },
      createdAt: FieldValue.serverTimestamp(),
    })
    console.log(`${r.username}: removed ${usd(r.extra)} (cash ${usd(r.cashBefore)} -> ${usd(r.cashAfter)})`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
