import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'

/** Client-side audit row (privileged actions also log from Cloud Functions). */
export async function pushAuditLog(action: string, detail: Record<string, unknown>) {
  const u = auth.currentUser
  if (!u) return
  try {
    await addDoc(collection(db, COLLECTIONS.auditLogs), {
      actorUid: u.uid,
      action,
      detail,
      createdAt: serverTimestamp(),
    })
  } catch {
    /* non-fatal */
  }
}
