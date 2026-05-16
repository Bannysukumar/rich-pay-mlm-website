import type { UserProfile } from '@/types/models'

/** Default landing route after sign-in when no safe `from` path was stored. */
export function homePathForRole(role: UserProfile['role'] | undefined): '/admin' | '/dashboard' {
  return role === 'admin' ? '/admin' : '/dashboard'
}

/** Open redirect guard + role-aware default (admins → `/admin`, members → `/dashboard`). */
export function safeAuthReturnPath(from: unknown, role: UserProfile['role'] | undefined): string {
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.includes('..')) {
    return from
  }
  return homePathForRole(role)
}
