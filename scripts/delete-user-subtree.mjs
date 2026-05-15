/**
 * Delete a member and their entire downline (sponsorUid tree): Firestore + Firebase Auth.
 *
 * Usage:
 *   node scripts/delete-user-subtree.mjs <service-account.json> <username-or-uid> [--execute] [--force-admin]
 *
 * Without --execute: prints resolved root + subtree size and sample only (no deletes).
 * With --execute: performs deletes (irreversible).
 *
 * Collections cleaned (best-effort, matching rich-pay-clone functions):
 *   users, usersByUsername, phoneIndex, activePackages, deposits, withdrawals,
 *   dailyProfits, internalTransfers, sponsorBonuses, teamLevelBonuses, rankBonuses,
 *   notifications
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
const COL_USERS_BY_UN = 'usersByUsername'
const COL_PHONE = 'phoneIndex'
const COL_ACTIVE = 'activePackages'
const COL_DEPOSITS = 'deposits'
const COL_WITHDRAWALS = 'withdrawals'
const COL_DAILY = 'dailyProfits'
const COL_INTERNAL = 'internalTransfers'

const args = process.argv.slice(2).filter((a) => a !== '--execute' && a !== '--force-admin')
const EXECUTE = process.argv.includes('--execute')
const FORCE_ADMIN = process.argv.includes('--force-admin')

const [keyPath, identifierRaw] = args

if (!keyPath || !identifierRaw || process.argv.includes('-h')) {
  console.error(
    'Usage: node scripts/delete-user-subtree.mjs <service-account.json> <username-or-uid> [--execute] [--force-admin]',
  )
  process.exit(1)
}

if (keyPath.includes('<') || keyPath.includes('>')) {
  console.error('Pass the real path to the service account JSON file.')
  process.exit(1)
}

const identifier = String(identifierRaw).trim()
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const auth = admin.auth()

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function resolveRootUid(raw) {
  const key = raw.toLowerCase()
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get()
  if (mapSnap.exists) {
    const uid = String(mapSnap.data()?.uid ?? '').trim()
    if (uid) return { uid, via: 'usersByUsername' }
  }
  const direct = await db.collection(COL_USERS).doc(raw).get()
  if (direct.exists) {
    return { uid: direct.id, via: 'users.docId' }
  }
  throw new Error(`User not found for "${raw}" (no usersByUsername/${key} and no users/${raw})`)
}

/** All uids in subtree including root (BFS on sponsorUid). */
async function collectSubtreeUids(rootUid) {
  const seen = new Set([rootUid])
  let frontier = [rootUid]
  while (frontier.length) {
    const next = []
    for (const part of chunkArray(frontier, 30)) {
      const snap = await db.collection(COL_USERS).where('sponsorUid', 'in', part).get()
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue
        seen.add(doc.id)
        next.push(doc.id)
      }
    }
    frontier = next
  }
  return [...seen]
}

/** Deepest downline first, root last — safe if the job is interrupted mid-user-delete. */
async function orderUidsDeepestFirst(rootUid, uids) {
  const depthMap = new Map([[rootUid, 0]])
  let frontier = [rootUid]
  while (frontier.length) {
    const next = []
    for (const part of chunkArray(frontier, 30)) {
      const snap = await db.collection(COL_USERS).where('sponsorUid', 'in', part).get()
      for (const doc of snap.docs) {
        if (depthMap.has(doc.id)) continue
        const sp = String(doc.data()?.sponsorUid ?? '')
        depthMap.set(doc.id, (depthMap.get(sp) ?? 0) + 1)
        next.push(doc.id)
      }
    }
    frontier = next
  }
  return [...uids].sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0))
}

async function deleteRefsBatched(refs) {
  let total = 0
  for (const batch of chunkArray(refs, 450)) {
    const wb = db.batch()
    for (const r of batch) wb.delete(r)
    await wb.commit()
    total += batch.length
  }
  return total
}

/** Collect doc refs from `where(field, 'in', chunk)` then delete in batches of 450. */
async function deleteQueryDocsInChunks(collectionName, field, uids, label) {
  const refs = []
  for (const part of chunkArray(uids, 30)) {
    const snap = await db.collection(collectionName).where(field, 'in', part).get()
    for (const d of snap.docs) refs.push(d.ref)
  }
  if (label) console.error(`  … deleting ${refs.length} ${collectionName} (${label})`)
  return deleteRefsBatched(refs)
}

async function deleteInternalTransfersForUids(uids) {
  const byPath = new Map()
  for (const part of chunkArray(uids, 30)) {
    for (const field of ['userId', 'recipientUid']) {
      const snap = await db.collection(COL_INTERNAL).where(field, 'in', part).get()
      for (const d of snap.docs) byPath.set(d.ref.path, d.ref)
    }
  }
  const refs = [...byPath.values()]
  console.error(`  … deleting ${refs.length} ${COL_INTERNAL}`)
  return deleteRefsBatched(refs)
}

async function deleteBonusPairs(collectionName, uids) {
  const byPath = new Map()
  for (const part of chunkArray(uids, 30)) {
    for (const field of ['userId', 'fromUserId']) {
      const snap = await db.collection(collectionName).where(field, 'in', part).get()
      for (const d of snap.docs) byPath.set(d.ref.path, d.ref)
    }
  }
  const refs = [...byPath.values()]
  console.error(`  … deleting ${refs.length} ${collectionName}`)
  return deleteRefsBatched(refs)
}

async function main() {
  const { uid: rootUid, via } = await resolveRootUid(identifier)
  const rootSnap = await db.collection(COL_USERS).doc(rootUid).get()
  if (!rootSnap.exists) throw new Error('Root user doc missing after resolve')
  const rootData = rootSnap.data()
  const role = String(rootData?.role ?? '')
  const username = String(rootData?.username ?? '')
  if (role === 'admin' && !FORCE_ADMIN) {
    throw new Error('Refusing to delete admin user without --force-admin')
  }

  const uids = await collectSubtreeUids(rootUid)
  const downlineOnly = uids.filter((id) => id !== rootUid)

  console.log(JSON.stringify({ via, rootUid, username, role, subtreeTotal: uids.length, downlineCount: downlineOnly.length }, null, 2))

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to delete (irreversible).')
    return
  }

  const counts = {}
  console.error('Deleting related Firestore docs…')

  counts.activePackages_userId = await deleteQueryDocsInChunks(COL_ACTIVE, 'userId', uids, 'userId')
  counts.deposits_userId = await deleteQueryDocsInChunks(COL_DEPOSITS, 'userId', uids, 'userId')
  counts.withdrawals_userId = await deleteQueryDocsInChunks(COL_WITHDRAWALS, 'userId', uids, 'userId')
  counts.dailyProfits_userId = await deleteQueryDocsInChunks(COL_DAILY, 'userId', uids, 'userId')
  counts.internalTransfers = await deleteInternalTransfersForUids(uids)
  counts.sponsorBonuses = await deleteBonusPairs('sponsorBonuses', uids)
  counts.teamLevelBonuses = await deleteBonusPairs('teamLevelBonuses', uids)
  counts.rankBonuses_userId = await deleteQueryDocsInChunks('rankBonuses', 'userId', uids, 'userId')
  counts.notifications_userId = await deleteQueryDocsInChunks('notifications', 'userId', uids, 'userId')

  const uidsDeleteOrder = await orderUidsDeepestFirst(rootUid, uids)
  console.error('Deleting user profiles, username maps, phone index, Auth… (deepest first)')
  // Per-user: users doc, usersByUsername, phoneIndex (if owned by uid)
  for (const uid of uidsDeleteOrder) {
    const uref = db.collection(COL_USERS).doc(uid)
    const usnap = await uref.get()
    if (!usnap.exists) continue
    const data = usnap.data()
    const un = String(data?.username ?? '').trim().toLowerCase()
    const phone = String(data?.phone ?? '').trim()

    if (un) {
      const m = await db.collection(COL_USERS_BY_UN).doc(un).get()
      if (m.exists && String(m.data()?.uid ?? '') === uid) {
        await m.ref.delete()
      }
    }
    if (phone) {
      const p = await db.collection(COL_PHONE).doc(phone).get()
      if (p.exists && String(p.data()?.uid ?? '') === uid) {
        await p.ref.delete()
      }
    }
    await uref.delete()
  }

  for (const uid of uidsDeleteOrder) {
    try {
      await auth.deleteUser(uid)
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? e.code : ''
      if (code !== 'auth/user-not-found') {
        console.error(`Auth delete failed for ${uid}:`, e.message || e)
      }
    }
  }

  console.log('\nDelete complete.', JSON.stringify({ ...counts, authUsersAttempted: uids.length }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
