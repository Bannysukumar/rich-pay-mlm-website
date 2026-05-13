import { FirebaseError } from 'firebase/app'

/** Human-readable message from Firebase (Auth, Firestore, Callable / HTTPS). */
export function getCallableErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError && typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim()
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  return ''
}
