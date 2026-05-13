import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { PublicNavbar } from '@/features/landing/PublicNavbar'
import '@/features/landing/landing.css'
import { requestPasswordResetCallable } from '@/lib/api/authCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'

const schema = z.object({
  username: z
    .string()
    .min(4, 'UserID is required')
    .regex(/^\d{4,12}$/, 'Enter your numeric UserID (for example 9994549)'),
  email: z.string().min(3, 'Email is required').email('Enter a valid email address'),
})

type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    document.title = 'Forgot Password | RichPay'
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    setBanner(null)
    try {
      const res = await requestPasswordResetCallable({
        username: data.username.trim(),
        email: data.email.trim().toLowerCase(),
      })
      if (res.sent) {
        setBanner({ kind: 'ok', text: res.message })
        toast.success(res.message)
      } else {
        setBanner({ kind: 'err', text: res.message })
        toast.error(res.message)
      }
    } catch (err: unknown) {
      const msg = getCallableErrorMessage(err) || 'Request failed. Try again or contact support.'
      setBanner({ kind: 'err', text: msg })
      toast.error(msg)
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
              Forgot <span className="text-gold">Password</span>
            </h2>
            <p>Enter your numeric UserID and the email registered on your account. We will send a reset link if they match.</p>
          </div>

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

          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="form-group">
              <label htmlFor="forgot-userid">UserID</label>
              <input
                id="forgot-userid"
                type="text"
                inputMode="numeric"
                className="form-control"
                placeholder="e.g. 9994549"
                autoComplete="username"
                {...register('username')}
              />
              {errors.username ? <p className="auth-field-error">{errors.username.message}</p> : null}
            </div>

            <div className="form-group">
              <label htmlFor="forgot-email">Registered email</label>
              <input
                id="forgot-email"
                type="email"
                className="form-control"
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email ? <p className="auth-field-error">{errors.email.message}</p> : null}
            </div>

            <button type="submit" className="btn-gold pulse auth-login-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

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
