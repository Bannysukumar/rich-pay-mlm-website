import { zodResolver } from '@hookform/resolvers/zod'
import {
  browserSessionPersistence,
  indexedDBLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { PublicNavbar } from '@/features/landing/PublicNavbar'
import '@/features/landing/landing.css'
import { useAuthState } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase'

function safeReturnPath(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/dashboard'
  if (from.includes('..')) return '/dashboard'
  return from
}

const schema = z.object({
  userid: z.string().min(1, 'UserID is required').email('Enter a valid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
})

type Form = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { firebaseUid, profileLoaded, profile } = useAuthState()
  const gated = Boolean((loc.state as { blocked?: boolean } | undefined)?.blocked)
  /** Default on — persists via IndexedDB; uncheck on shared devices. */
  const [staySignedIn, setStaySignedIn] = useState(true)

  useEffect(() => {
    document.title = 'Institutional Login | RichPay Access Hub'
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  if (!profileLoaded) {
    return (
      <div className="landing-root auth-page-shell">
        <div className="flex min-h-svh items-center justify-center bg-rich-black text-zinc-500">
          Restoring session…
        </div>
      </div>
    )
  }

  const sessionOk = Boolean(firebaseUid) && !profile?.blocked
  if (sessionOk) {
    const from = (loc.state as { from?: string } | undefined)?.from
    return <Navigate to={safeReturnPath(from)} replace />
  }

  const onSubmit = async (data: Form) => {
    try {
      // IndexedDB survives browser quit; session storage is cleared when the session ends.
      await setPersistence(auth, staySignedIn ? indexedDBLocalPersistence : browserSessionPersistence)
      await signInWithEmailAndPassword(auth, data.userid.trim(), data.password)
      toast.success('Welcome back')
      navigate('/dashboard', { replace: true })
    } catch {
      toast.error('Invalid credentials')
    }
  }

  return (
    <div className="landing-root auth-page-shell">
      <div className="blob blob-1" aria-hidden />
      <div className="blob blob-2" aria-hidden />

      <PublicNavbar />

      <main className="auth-main">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="card glass auth-form-card"
        >
          <div className="auth-form-header">
            <Link to="/" className="logo auth-form-logo">
              <img
                src="/assets/images/richpay_logo.png"
                alt="RichPay Logo"
                className="mx-auto h-10 w-auto"
                onError={(e) => {
                  e.currentTarget.src = '/assets/images/richpay_logo.svg'
                }}
              />
            </Link>
            <h2>
              Secure <span className="text-gold">Login</span>
            </h2>
            <p>Enter your credentials to access your trading portfolio.</p>
            {gated && (
              <p className="mt-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                This account has been restricted by an administrator. Reach out to support if you believe this is a
                mistake.
              </p>
            )}
          </div>

          <form id="loginForm" className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="form-group">
              <label htmlFor="login-userid">UserID</label>
              <input
                id="login-userid"
                type="text"
                className="form-control"
                placeholder="UserID"
                autoComplete="username"
                {...register('userid')}
              />
              {errors.userid ? <p className="auth-field-error">{errors.userid.message}</p> : null}
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-control"
                placeholder="Your secure password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password ? <p className="auth-field-error">{errors.password.message}</p> : null}
              <div className="auth-forgot-wrap">
                <a
                  href="#forgot"
                  className="text-gold auth-forgot-link"
                  onClick={(e) => {
                    e.preventDefault()
                    toast('Contact support to recover your password.')
                  }}
                >
                  Forgot Password?
                </a>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-group">
                <input
                  type="checkbox"
                  checked={staySignedIn}
                  onChange={(e) => setStaySignedIn(e.target.checked)}
                />
                <span className="checkbox-group-label">Stay signed in for 30 days</span>
              </label>
            </div>

            <button type="submit" className="btn-gold pulse auth-login-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Login to Dashboard'}
            </button>
          </form>

          <div className="auth-links">
            Don&apos;t have an institutional account? <br />
            <Link to="/register" className="text-gold auth-register-link">
              Register New Account
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="auth-page-footer">
        <p>
          © {new Date().getFullYear()} RichPay International. Multi-Layer SSL Security Enabled.
        </p>
      </footer>
    </div>
  )
}
