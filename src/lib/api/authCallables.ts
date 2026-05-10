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
