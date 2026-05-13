import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'

export interface RegisterPayload {
  email: string
  password: string
  fullName: string
  phone: string
  sponsorUsername: string | null
  termsAccepted: boolean
}

export interface RegisterResult {
  username: string
  uid: string
}

export async function registerWithProfile(payload: RegisterPayload): Promise<RegisterResult> {
  const fn = getHttpsCallable('registerWithProfile')
  const res = await fn(payload)
  const data = res.data as RegisterResult
  return data
}

/** No auth — used on public register page to show sponsor full name. */
export async function publicResolveReferrerCallable(username: string): Promise<{ found: boolean; fullName: string }> {
  const fn = getHttpsCallable('publicResolveReferrer')
  const res = await fn({ username })
  return res.data as { found: boolean; fullName: string }
}

export type PasswordResetResult = { sent: boolean; message: string }

/** No auth — verifies UserID + registered email, then sends Firebase password reset email. */
export async function requestPasswordResetCallable(payload: {
  username: string
  email: string
}): Promise<PasswordResetResult> {
  const firebaseWebApiKey = String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim()
  const fn = getHttpsCallable('requestPasswordReset')
  const res = await fn({ ...payload, firebaseWebApiKey })
  return res.data as PasswordResetResult
}
