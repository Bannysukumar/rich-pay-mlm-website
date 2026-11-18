/**
 * Attribute lifetime working income (sponsor + team + rank) onto each member's
 * oldest active packages in start order until each package's own 3× is filled.
 * Packages that are already over their own 3× are completed.
 *
 * Usage:
 *   node scripts/backfill-attribute-working-to-oldest-package.mjs <service-account.json> [--execute] [username]
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const args = process.argv.slice(2)
const keyPath = args.find((a) => a.endsWith('.json'))
const execute = args.includes('--execute')
const onlyUser = args.find((a) => a !== keyPath && a !== '--execute')

if (!keyPath) {
  console.error(
    'Usage: node scripts/backfill-attribute-working-to-oldest-package.mjs <sa.json> [--execute] [username]',
  )
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

function workingTotal(u) {
  const explicit = Number(u.userTotals?.totalWorkingIncome ?? NaN)
  if (Number.isFinite(explicit) && explicit >= 0) return explicit
  return (
    Number(u.sponsorBonusTotal ?? 0) +
    Number(u.teamLevelCommissionTotal ?? 0) +
    Number(u.rankCommissionTotal ?? 0)
  )
}

function caps(x) {
  const ps = x.planSnapshot || {}
  const amt = Math.max(0, Number(x.amount || 0))
  const nw = Number(
    x.frozenNonWorkingCapMultiplier ?? ps.nonWorkingIncomeCapMultiplier ?? 2,
  )
  const w = Number(x.frozenWorkingCapMultiplier ?? ps.workingIncomeCapMultiplier ?? 1)
  return { amt, nw: Math.max(0, nw), w: Math.max(0, w), ceiling: amt * (Math.max(0, nw) + Math.max(0, w)) }
}

function startedMs(x) {
  return x.startedAt?.toMillis?.() || Number(x.startedAt) || 0
}

async function resolveUid(identifier) {
  const key = String(identifier).trim().toLowerCase()
  const mapSnap = await db.collection('usersByUsername').doc(key).get()
  if (mapSnap.exists && mapSnap.data()?.uid) return String(mapSnap.data().uid)
  const direct = await db.collection('users').doc(String(identifier).trim()).get()
  if (direct.exists) return direct.id
  throw new Error(`User not found: ${identifier}`)
}

async function processUser(uid, u) {
  const working = workingTotal(u)
  const snap = await db.collection('activePackages').where('userId', '==', uid).get()
  const pkgs = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => startedMs(a) - startedMs(b))

  let remainingWorking = working
  const actions = []

  for (const p of pkgs) {
    const { amt, ceiling } = caps(p)
    const roi = Math.max(0, Number(p.nonWorkingPaid || 0))
    const alreadyAttr = Math.max(0, Number(p.attributedWorkingIncome || 0))
    const roomForWorking = Math.max(0, ceiling - roi - alreadyAttr)
    const status = String(p.status || '').toLowerCase()

    if (status !== 'active') {
      actions.push({
        packageId: p.id,
        status,
        amount: amt,
        started: p.startedAt?.toDate?.()?.toISOString?.().slice(0, 10),
        skip: 'not_active',
      })
      continue
    }

    const assign = Math.min(remainingWorking, roomForWorking)
    const nextAttr = alreadyAttr + assign
    remainingWorking = Math.max(0, remainingWorking - assign)
    const filled = roi + nextAttr
    const shouldComplete = filled + 1e-9 >= ceiling

    actions.push({
      packageId: p.id,
      status,
      amount: amt,
      started: p.startedAt?.toDate?.()?.toISOString?.().slice(0, 10),
      roi,
      ceiling: r2(ceiling),
      attributedBefore: r2(alreadyAttr),
      attributedAssign: r2(assign),
      attributedAfter: r2(nextAttr),
      shouldComplete,
      completedReason: shouldComplete ? 'package_income_3x' : null,
    })

    if (execute) {
      const patch = {
        attributedWorkingIncome: nextAttr,
        updatedAt: Date.now(),
        attributedWorkingIncomeBackfillAt: Date.now(),
      }
      if (shouldComplete) {
        patch.status = 'completed'
        patch.completedReason = 'package_income_3x'
      }
      await p.ref.set(patch, { merge: true })
    }
  }

  // If oldest actives absorbed working and some remain with no package room, leftover stays un-attributed
  // (already paid historically; no clawback).
  return {
    uid,
    username: u.username,
    workingLifetime: r2(working),
    workingLeftUnattributed: r2(remainingWorking),
    actions,
  }
}

async function main() {
  console.log(execute ? 'MODE: EXECUTE' : 'MODE: DRY-RUN')
  const results = []

  if (onlyUser) {
    const uid = await resolveUid(onlyUser)
    const us = await db.collection('users').doc(uid).get()
    if (!us.exists) throw new Error('user missing')
    results.push(await processUser(uid, us.data()))
  } else {
    const users = await db.collection('users').get()
    let i = 0
    for (const d of users.docs) {
      i++
      const u = d.data()
      const w = workingTotal(u)
      if (w <= 1e-9) continue
      const r = await processUser(d.id, u)
      if (r.actions.some((a) => a.attributedAssign > 0 || a.shouldComplete)) {
        results.push(r)
      }
      if (i % 50 === 0) console.log(`scanned ${i}/${users.size}…`)
    }
  }

  const completeCount = results.reduce(
    (n, r) => n + r.actions.filter((a) => a.shouldComplete).length,
    0,
  )
  console.log(
    JSON.stringify(
      {
        usersTouched: results.length,
        packagesToComplete: completeCount,
        sample: results.slice(0, 5),
        focus: results.find((r) => String(r.username) === '9994597') || null,
      },
      null,
      2,
    ),
  )

  if (execute) {
    await db.collection('auditLogs').add({
      actorUid: 'admin-cli',
      action: 'backfillAttributeWorkingToOldestPackage',
      detail: {
        usersTouched: results.length,
        packagesToComplete: completeCount,
        onlyUser: onlyUser || null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } else {
    console.log('\nRe-run with --execute to apply.')
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
