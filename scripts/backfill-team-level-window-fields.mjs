/**
 * Backfill teamLevelBonuses window fields for legacy rows (missing downlinePackageStartedAt / maxPayDays).
 *
 * Usage:
 *   node scripts/backfill-team-level-window-fields.mjs <service-account.json>
 *   node scripts/backfill-team-level-window-fields.mjs <service-account.json> --execute
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const COL_TEAM = 'teamLevelBonuses'
const COL_ACTIVE = 'activePackages'
const IST = 'Asia/Kolkata'
const DEFAULT_CAP_PCT = 50

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const EXECUTE = process.argv.includes('--execute')
const [keyPath] = args

if (!keyPath) {
  console.error('Usage: node scripts/backfill-team-level-window-fields.mjs <service-account.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

function istDayKey(when) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when)
}

function wholeIstDaysSinceStart(startedAtMs, asOfMs) {
  const [sy, sm, sd] = istDayKey(new Date(startedAtMs)).split('-').map(Number)
  const [ey, em, ed] = istDayKey(new Date(asOfMs)).split('-').map(Number)
  return Math.max(0, Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000))
}

function tsMs(ts) {
  if (ts == null) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  return null
}

function capPctForLevel(ap, level) {
  const ps = ap.planSnapshot
  const rows = Array.isArray(ps?.teamLevels) ? ps.teamLevels : []
  const row = rows.find((r) => Number(r?.level) === Number(level))
  const raw = row?.uplineDurationCapPercent
  const n = Number(raw ?? DEFAULT_CAP_PCT)
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : DEFAULT_CAP_PCT))
}

function maxPayDays(durationDays, capPct) {
  const dur = Math.max(0, Math.floor(durationDays))
  if (dur <= 0) return null
  const max = Math.floor((dur * capPct) / 100)
  return max > 0 ? max : 0
}

async function main() {
  const snap = await db.collection(COL_TEAM).get()
  const pkgCache = new Map()
  const toPatch = []

  for (const doc of snap.docs) {
    const d = doc.data()
    if (d.downlinePackageStartedAt != null && d.teamLevelWindowMaxPayDays !== undefined) continue

    const pkgId = String(d.activePackageId ?? '')
    if (!pkgId) continue

    if (!pkgCache.has(pkgId)) {
      const p = await db.collection(COL_ACTIVE).doc(pkgId).get()
      pkgCache.set(pkgId, p.exists ? p.data() : null)
    }
    const ap = pkgCache.get(pkgId)
    if (!ap?.startedAt) continue

    const startedMs = tsMs(ap.startedAt)
    const createdMs = tsMs(d.createdAt)
    if (startedMs == null || createdMs == null) continue

    const level = Number(d.level ?? 0)
    const durationDays = Math.floor(
      Number(ap.durationDays ?? ap.planSnapshot?.durationDays ?? 0),
    )
    const capPct = capPctForLevel(ap, level)
    const maxDays = maxPayDays(durationDays, capPct)
    const elapsed = wholeIstDaysSinceStart(startedMs, createdMs)
    const remaining = maxDays == null ? null : Math.max(0, maxDays - elapsed)

    toPatch.push({
      ref: doc.ref,
      patch: {
        downlinePackageStartedAt: ap.startedAt,
        teamLevelWindowDurationDays: durationDays,
        teamLevelWindowCapPercent: capPct,
        teamLevelWindowMaxPayDays: maxDays,
        teamLevelWindowRemainingDays: remaining,
      },
    })
  }

  console.log(
    JSON.stringify(
      {
        legacyRowsToBackfill: toPatch.length,
        execute: EXECUTE,
        sample: toPatch.slice(0, 3).map((x) => ({ id: x.ref.id, ...x.patch, teamLevelWindowMaxPayDays: x.patch.teamLevelWindowMaxPayDays })),
      },
      null,
      2,
    ),
  )

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to write fields.')
    return
  }

  let batch = db.batch()
  let ops = 0
  for (const row of toPatch) {
    batch.set(row.ref, row.patch, { merge: true })
    ops++
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()

  console.log(`\nDone. Backfilled ${toPatch.length} teamLevelBonuses rows.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
