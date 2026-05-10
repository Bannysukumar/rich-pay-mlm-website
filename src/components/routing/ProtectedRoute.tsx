import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthState } from '@/hooks/useAuth'

export function ProtectedRoute({
  children,
  adminOnly,
}: {
  children: ReactNode
  adminOnly?: boolean
}) {
  const { firebaseUid, profile, profileLoaded } = useAuthState()
  const loc = useLocation()

  if (!profileLoaded) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-rich-black text-zinc-500">
        Loading secure session…
      </div>
    )
  }

  if (!firebaseUid) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }

  if (profile?.blocked && !adminOnly) {
    return <Navigate to="/login" replace state={{ blocked: true }} />
  }

  if (adminOnly && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
