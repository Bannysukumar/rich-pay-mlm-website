import { signOut } from 'firebase/auth'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@/lib/firebase'

export function LogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    void (async () => {
      await signOut(auth)
      navigate('/login', { replace: true })
    })()
  }, [navigate])

  return (
    <div className="flex min-h-svh items-center justify-center bg-rich-black text-zinc-500">
      Signing out…
    </div>
  )
}
