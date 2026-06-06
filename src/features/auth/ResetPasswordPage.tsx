import { verifyPasswordResetCode } from 'firebase/auth'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AuthPasswordInput } from '@/features/auth/AuthPasswordInput'
import { PublicNavbar } from '@/features/landing/PublicNavbar'
import '@/features/landing/landing.css'
import { completePasswordResetCallable } from '@/lib/api/authCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { auth } from '@/lib/firebase'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const oobCode = useMemo(() => searchParams.get('oobCode')?.trim() ?? '', [searchParams])
  const mode = useMemo(() => searchParams.get('mode')?.trim() ?? '', [searchParams])

  const [emailHint, setEmailHint] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    document.title = 'Reset Password | RichPay'
  }, [])

  useEffect(() => {
    if (!oobCode || mode !== 'resetPassword') return
    void verifyPasswordResetCode(auth, oobCode)
      .then((email) => setEmailHint(email))
      .catch(() => setBanner({ kind: 'err', text: 'This reset link is invalid or has expired. Request a new one.' }))
  }, [mode, oobCode])

  const invalidLink = !oobCode || mode !== 'resetPassword'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (invalidLink) return
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setBanner(null)
    setBusy(true)
    try {
      await completePasswordResetCallable({ oobCode, newPassword })
      toast.success('Password updated. Other signed-in devices were signed out.')
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const msg = getCallableErrorMessage(err) || 'Could not reset password. The link may have expired.'
      setBanner({ kind: 'err', text: msg })
      toast.error(msg)
    } finally {
      setBusy(false)
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
              Reset <span className="text-gold">Password</span>
            </h2>
            <p>Choose a new login password for your account.</p>
          </div>

          {invalidLink ? (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
              Missing or invalid reset link. Use the link from your email or{' '}
              <Link to="/forgot-password" className="text-gold underline">
                request a new reset
              </Link>
              .
            </div>
          ) : null}

          {banner ? (
            <div
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                banner.kind === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100'
                  : 'border-red-500/40 bg-red-950/40 text-red-200'
              }`}
              role="status"
            >
              {banner.text}
            </div>
          ) : null}

          {!invalidLink ? (
            <form className="auth-form" onSubmit={(ev) => void onSubmit(ev)} noValidate>
              {emailHint ? (
                <p className="mb-3 text-sm text-zinc-400">
                  Resetting password for <span className="text-zinc-200">{emailHint}</span>
                </p>
              ) : null}
              <div className="form-group">
                <label htmlFor="reset-new-password">New password</label>
                <AuthPasswordInput
                  id="reset-new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <div className="form-group">
                <label htmlFor="reset-confirm-password">Confirm new password</label>
                <AuthPasswordInput
                  id="reset-confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <button type="submit" className="btn-gold pulse auth-login-submit" disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </form>
          ) : null}

          <div className="auth-links">
            <Link to="/login" className="text-gold auth-register-link">
              Back to login
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="auth-page-footer">
        <p>© {new Date().getFullYear()} RichPay International.</p>
      </footer>
    </div>
  )
}
