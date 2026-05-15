/**
 * Apply the **current** `teamLevels` collection (active rows, same tie-break as Cloud Functions)
 * to every **active** `activePackages` document (`planSnapshot.teamLevels`) and sync
 * `users.rankCompensationSnapshot.teamLevels` for members who still have an active package.
 *
 * Keeps daily team-level income aligned with /admin/team-levels after admin edits.
 *
 * Usage:
 *   node scripts/refresh-frozen-team-levels.mjs <service-account.json> [--execute]
 *
 * Without --execute: prints team depth, frozen row count, and how many docs would be updated.
 *
 * Must stay in sync with `freezeTeamLevelsForActivation` in `functions/src/index.ts`
 * and `DEFAULT_UPLINE_DURATION_CAP_PERCENT` in `compensationDefaults.ts`.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

const COL_TEAM_LEVELS = 'teamLevels'
const COL_ACTIVE = 'activePackages'
const COL_USERS = 'users'
const COL_SETTINGS = 'siteSettings'

/** Keep aligned with `functions/src/compensationDefaults.ts` */
const DEFAULT_UPLINE_DURATION_CAP_PERCENT = 50

const args = process.argv.slice(2).filter((a) => a !== '--execute')
const EXECUTE = process.argv.includes('--execute')
const [keyPath] = args

if (!keyPath || process.argv.includes('-h')) {
  console.error('Usage: node scripts/refresh-frozen-team-levels.mjs <service-account.json> [--execute]')
  process.exit(1)
}

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

function teamLevelDocTimeMs(x) {
  const u = x.updatedAt
  if (u != null && typeof u.toMillis === 'function') return u.toMillis()
  if (typeof u === 'number' && Number.isFinite(u)) return u
  const c = x.createdAt
  if (c != null && typeof c.toMillis === 'function') return c.toMillis()
  if (typeof c === 'number' && Number.isFinite(c)) return c
  return 0
}

function isSeedTeamLevelDocId(id) {
  return /^seed_lvl_\d+$/i.test(id)
}

function betterTeamLevelDoc(a, b) {
  if (b.ts > a.ts) return b
  if (b.ts < a.ts) return a
  if (isSeedTeamLevelDocId(a.id) && !isSeedTeamLevelDocId(b.id)) return b
  if (!isSeedTeamLevelDocId(a.id) && isSeedTeamLevelDocId(b.id)) return a
  return b.id >= a.id ? b : a
}

function frozenRowFromTeamLevelData(lvl, x) {
  const desc = x.conditionDescription != null ? String(x.conditionDescription).trim() : ''
  const rawCap = Number(x.uplineDurationCapPercent ?? DEFAULT_UPLINE_DURATION_CAP_PERCENT)
  const uplineDurationCapPercent = Math.max(
    0,
    Math.min(100, Number.isFinite(rawCap) ? rawCap : DEFAULT_UPLINE_DURATION_CAP_PERCENT),
  )
  const row = {
    level: lvl,
    percent: Number(x.percent ?? 0),
    requiredDirects: Number(x.requiredDirects ?? x.directs ?? 0),
    uplineDurationCapPercent,
  }
  if (desc) row.conditionDescription = desc
  return row
}

async function freezeTeamLevelsForActivation(maxLevels) {
  const cap = Math.min(100, Math.max(1, maxLevels))
  const snap = await db.collection(COL_TEAM_LEVELS).where('active', '==', true).get()
  const winners = new Map()
  for (const d of snap.docs) {
    const x = d.data()
    const lvl = Number(x.level ?? 0)
    if (!Number.isFinite(lvl) || lvl < 1) continue
    const ts = teamLevelDocTimeMs(x)
    const cand = { id: d.id, ts, data: x }
    const cur = winners.get(lvl)
    if (!cur) {
      winners.set(lvl, cand)
      continue
    }
    winners.set(lvl, betterTeamLevelDoc(cur, cand))
  }
  const byLevel = new Map()
  for (const [lvl, pick] of winners) {
    byLevel.set(lvl, frozenRowFromTeamLevelData(lvl, pick.data))
  }
  return Array.from({ length: cap }, (_, i) => {
    const L = i + 1
    return byLevel.get(L) ?? {
      level: L,
      percent: 0,
      requiredDirects: 0,
      conditionDescription: '',
      uplineDurationCapPercent: DEFAULT_UPLINE_DURATION_CAP_PERCENT,
    }
  })
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  const settingsSnap = await db.collection(COL_SETTINGS).doc('config').get()
  const settings = settingsSnap.data() ?? {}
  const teamDepth = Math.min(100, Math.max(1, Number(settings.teamLevelsCount ?? 30)))
  const planSettingsVersion = Number(settings.planSettingsVersion ?? 0)

  const teamLevelsFrozen = await freezeTeamLevelsForActivation(teamDepth)
  const now = Date.now()

  console.log(
    JSON.stringify(
      {
        teamLevelsCount: teamDepth,
        planSettingsVersion,
        frozenLevels: teamLevelsFrozen.length,
        sampleLevels: teamLevelsFrozen.slice(0, 5),
      },
      null,
      2,
    ),
  )

  const snap = await db.collection(COL_ACTIVE).where('status', '==', 'active').get()
  const packageRefs = []
  let skippedNoSnapshot = 0
  for (const d of snap.docs) {
    const ap = d.data()
    const ps = ap.planSnapshot
    if (!ps || typeof ps !== 'object') {
      skippedNoSnapshot++
      continue
    }
    packageRefs.push({ ref: d.ref, userId: String(ap.userId ?? '') })
  }

  const userIds = [...new Set(packageRefs.map((p) => p.userId).filter(Boolean))]
  console.log(
    JSON.stringify(
      {
        activePackages: snap.size,
        toUpdatePackages: packageRefs.length,
        skippedNoPlanSnapshot: skippedNoSnapshot,
        distinctUsersForRankSnapshot: userIds.length,
      },
      null,
      2,
    ),
  )

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to write Firestore updates.')
    return
  }

  let pkgBatches = 0
  for (const part of chunkArray(packageRefs, 400)) {
    const batch = db.batch()
    for (const { ref } of part) {
      batch.update(ref, {
        'planSnapshot.teamLevels': teamLevelsFrozen,
        'planSnapshot.teamLevelsSyncedAtMillis': now,
        'planSnapshot.teamLevelsSyncedFromPlanSettingsVersion': planSettingsVersion,
        updatedAt: now,
      })
    }
    await batch.commit()
    pkgBatches++
  }

  let userBatches = 0
  for (const part of chunkArray(userIds, 400)) {
    const batch = db.batch()
    for (const uid of part) {
      const uref = db.collection(COL_USERS).doc(uid)
      batch.update(uref, {
        'rankCompensationSnapshot.teamLevels': teamLevelsFrozen,
        'rankCompensationSnapshot.teamLevelsSyncedAtMillis': now,
        updatedAt: now,
      })
    }
    await batch.commit()
    userBatches++
  }

  console.log(
    '\nDone.',
    JSON.stringify({ packageUpdateBatches: pkgBatches, userUpdateBatches: userBatches }, null, 2),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
