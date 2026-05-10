import { doc, increment, setDoc } from 'firebase/firestore'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

/** Increment when commission matrix / ranks change so activations distinguish policy generations. */
export async function bumpPlanSettingsVersion(): Promise<void> {
  await setDoc(
    doc(db, COLLECTIONS.siteSettings, 'config'),
    { planSettingsVersion: increment(1), updatedAt: Date.now() },
    { merge: true },
  )
}
