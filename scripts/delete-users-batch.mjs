/**
 * Delete multiple members by numeric UserID (usersByUsername key).
 * Merges each user's full downline subtree, then deletes related Firestore + Auth once.
 *
 * Usage:
 *   node scripts/delete-users-batch.mjs <service-account.json> [--execute] [--force-admin]
 *
 * Edit USER_IDS below or pass IDs as extra args after the key path.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'))

/** Requested UserIDs (deduped). */
const DEFAULT_USER_IDS = [
  '7453312', '9432464', '8783710', '6311818', '3852429', '5459891', '6709367', '9149133',
  '9208161', '6761663', '7838105', '4175227', '7807112', '3421391', '1323602', '8194302',
  '3290584', '9724659', '1867646', '6940322', '5045619', '1620496', '2106650', '7117578',
  '3292944', '9623983', '6685842', '6722032', '7337122', '8716125', '6442800', '7906176',
  '5409646',
]

const COL_USERS = 'users'
const COL_USERS_BY_UN = 'usersByUsername'
const COL_PHONE = 'phoneIndex'
const COL_ACTIVE = 'activePackages'
const COL_DEPOSITS = 'deposits'
const COL_WITHDRAWALS = 'withdrawals'
const COL_DAILY = 'dailyProfits'
const COL_INTERNAL = 'internalTransfers'

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute')
const FORCE_ADMIN = argv.includes('--force-admin')
const filtered = argv.filter((a) => a !== '--execute' && a !== '--force-admin')
const [keyPath, ...extraIds] = filtered

if (!keyPath || keyPath.includes('-h')) {
  console.error(
    'Usage: node scripts/delete-users-batch.mjs <service-account.json> [userId ...] [--execute] [--force-admin]',
  )
  process.exit(1)
}

const USER_IDS = [...new Set((extraIds.length ? extraIds : DEFAULT_USER_IDS).map((x) => String(x).trim()))]

const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const auth = admin.auth()

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function resolveUid(username) {
  const key = String(username).trim().toLowerCase()
  const mapSnap = await db.collection(COL_USERS_BY_UN).doc(key).get()
  if (mapSnap.exists) {
    const uid = String(mapSnap.data()?.uid ?? '').trim()
    if (uid) return uid
  }
  const direct = await db.collection(COL_USERS).doc(key).get()
  if (direct.exists) return direct.id
  return null
}

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

async function orderUidsDeepestFirst(roots, uids) {
  const depthMap = new Map()
  for (const rootUid of roots) depthMap.set(rootUid, 0)
  let frontier = [...roots]
  while (frontier.length) {
    const next = []
    for (const part of chunkArray(frontier, 30)) {
      const snap = await db.collection(COL_USERS).where('sponsorUid', 'in', part).get()
      for (const doc of snap.docs) {
        if (!uids.includes(doc.id)) continue
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

async function deleteQueryDocsInChunks(collectionName, field, uids) {
  const refs = []
  for (const part of chunkArray(uids, 30)) {
    const snap = await db.collection(collectionName).where(field, 'in', part).get()
    for (const d of snap.docs) refs.push(d.ref)
  }
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
  return deleteRefsBatched([...byPath.values()])
}

async function deleteBonusPairs(collectionName, uids) {
  const byPath = new Map()
  for (const part of chunkArray(uids, 30)) {
    for (const field of ['userId', 'fromUserId']) {
      const snap = await db.collection(collectionName).where(field, 'in', part).get()
      for (const d of snap.docs) byPath.set(d.ref.path, d.ref)
    }
  }
  return deleteRefsBatched([...byPath.values()])
}

async function main() {
  const resolved = []
  const missing = []

  for (const userId of USER_IDS) {
    const uid = await resolveUid(userId)
    if (!uid) {
      missing.push(userId)
      continue
    }
    const snap = await db.collection(COL_USERS).doc(uid).get()
    const data = snap.data() || {}
    const role = String(data.role ?? '')
    if (role === 'admin' && !FORCE_ADMIN) {
      console.error(`SKIP admin UserID ${userId} (${uid}) — use --force-admin to delete`)
      continue
    }
    resolved.push({
      userId,
      uid,
      username: String(data.username ?? userId),
      fullName: String(data.fullName ?? ''),
      role,
    })
  }

  const rootUids = resolved.map((r) => r.uid)
  const allUidsSet = new Set()
  for (const uid of rootUids) {
    for (const u of await collectSubtreeUids(uid)) allUidsSet.add(u)
  }
  const allUids = [...allUidsSet]

  console.log(
    JSON.stringify(
      {
        requestedUserIds: USER_IDS.length,
        resolvedRoots: resolved.length,
        missingUserIds: missing,
        missingCount: missing.length,
        totalUidsIncludingDownlines: allUids.length,
        roots: resolved,
      },
      null,
      2,
    ),
  )

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to delete (irreversible).')
    return
  }

  if (allUids.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  console.error('Deleting related Firestore docs…')
  const counts = {}
  counts.activePackages = await deleteQueryDocsInChunks(COL_ACTIVE, 'userId', allUids)
  counts.deposits = await deleteQueryDocsInChunks(COL_DEPOSITS, 'userId', allUids)
  counts.withdrawals = await deleteQueryDocsInChunks(COL_WITHDRAWALS, 'userId', allUids)
  counts.dailyProfits = await deleteQueryDocsInChunks(COL_DAILY, 'userId', allUids)
  counts.internalTransfers = await deleteInternalTransfersForUids(allUids)
  counts.sponsorBonuses = await deleteBonusPairs('sponsorBonuses', allUids)
  counts.teamLevelBonuses = await deleteBonusPairs('teamLevelBonuses', allUids)
  counts.rankBonuses = await deleteQueryDocsInChunks('rankBonuses', 'userId', allUids)
  counts.notifications = await deleteQueryDocsInChunks('notifications', 'userId', allUids)

  const deleteOrder = await orderUidsDeepestFirst(rootUids, allUids)
  console.error(`Deleting ${deleteOrder.length} user profiles + Auth…`)
  for (const uid of deleteOrder) {
    const usnap = await db.collection(COL_USERS).doc(uid).get()
    if (!usnap.exists) continue
    const data = usnap.data()
    const un = String(data?.username ?? '').trim().toLowerCase()
    const phone = String(data?.phone ?? '').trim()
    if (un) {
      const m = await db.collection(COL_USERS_BY_UN).doc(un).get()
      if (m.exists && String(m.data()?.uid ?? '') === uid) await m.ref.delete()
    }
    if (phone) {
      const p = await db.collection(COL_PHONE).doc(phone).get()
      if (p.exists && String(p.data()?.uid ?? '') === uid) await p.ref.delete()
    }
    await usnap.ref.delete()
    try {
      await auth.deleteUser(uid)
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? e.code : ''
      if (code !== 'auth/user-not-found') console.error(`Auth delete ${uid}:`, e.message || e)
    }
  }

  console.log('\nDelete complete.', JSON.stringify(counts, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
