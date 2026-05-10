import { zodResolver } from '@hookform/resolvers/zod'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { PublicNavbar } from '@/features/landing/PublicNavbar'
import '@/features/landing/landing.css'
import { registerWithProfile } from '@/lib/api/authCallables'
import { auth } from '@/lib/firebase'

const schema = z
  .object({
    name: z.string().min(2, 'Full name required'),
    email: z.string().email('Valid email required'),
    mobile: z.string().min(8, 'Phone required'),
    sponsor: z.string().optional(),
    password: z.string().min(8, 'At least 8 characters'),
    cpassword: z.string(),
    terms: z.boolean().refine((v) => v, { message: 'You must accept the protocols' }),
  })
  .refine((d) => d.password === d.cpassword, {
    message: 'Passwords must match',
    path: ['cpassword'],
  })

type Form = z.infer<typeof schema>

function makeReferenceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  }
  return Date.now().toString(36).toUpperCase().slice(-8)
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refFromUrl = params.get('ref')

  useEffect(() => {
    document.title = 'Account Registration | Join RichPay Platform'
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { terms: false, sponsor: '' },
  })

  useEffect(() => {
    if (refFromUrl) {
      setValue('sponsor', refFromUrl)
    }
  }, [refFromUrl, setValue])

  const onSubmit = async (data: Form) => {
    try {
      const sponsor = (data.sponsor || '').trim() || null
      const res = await registerWithProfile({
        email: data.email.trim(),
        password: data.password,
        fullName: data.name.trim(),
        phone: data.mobile.trim(),
        sponsorUsername: sponsor,
        termsAccepted: true,
      })
      await signInWithEmailAndPassword(auth, data.email.trim(), data.password)
      toast.success('Portfolio initialized')
      navigate('/register/success', {
        replace: true,
        state: {
          displayName: data.name.trim(),
          userId: res.username,
          password: data.password,
          transactionPassword: data.password,
          referenceId: makeReferenceId(),
        },
      })
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
      toast.error(msg || 'Registration failed — deploy Cloud Functions and check Firebase config')
    }
  }

  return (
    <div className="landing-root auth-page-shell auth-register-shell">
      <div className="blob blob-1" aria-hidden />
      <div className="blob blob-2" aria-hidden />

      <PublicNavbar />

      <main className="auth-main">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="card glass auth-form-card auth-register-card"
        >
          <div className="auth-form-header auth-register-header">
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
              Initialize <span className="text-gold">Portfolio</span>
            </h2>
            <p>Complete the institutional onboarding to begin your earning journey.</p>
          </div>

          <form id="registerForm" className="auth-form auth-register-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="auth-register-grid">
              <div className="form-group auth-register-field">
                <label htmlFor="reg-name">Full Name</label>
                <input
                  id="reg-name"
                  type="text"
                  className="form-control"
                  placeholder="Name"
                  autoComplete="name"
                  {...register('name')}
                />
                {errors.name ? <p className="auth-field-error">{errors.name.message}</p> : null}
              </div>
              <div className="form-group auth-register-field">
                <label htmlFor="reg-email">Email Address</label>
                <input
                  id="reg-email"
                  type="email"
                  className="form-control"
                  placeholder="Email"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email ? <p className="auth-field-error">{errors.email.message}</p> : null}
              </div>
            </div>

            <div className="auth-register-grid">
              <div className="form-group auth-register-field">
                <label htmlFor="reg-mobile">Phone Number</label>
                <input
                  id="reg-mobile"
                  type="text"
                  className="form-control"
                  placeholder="+1 (555) 000-0000"
                  autoComplete="tel"
                  {...register('mobile')}
                />
                {errors.mobile ? <p className="auth-field-error">{errors.mobile.message}</p> : null}
              </div>
              <div className="form-group auth-register-field">
                <label htmlFor="reg-sponsor">Referral ID </label>
                <input
                  id="reg-sponsor"
                  type="text"
                  className="form-control"
                  placeholder="Sponsor ID"
                  readOnly={!!refFromUrl}
                  {...register('sponsor')}
                />
              </div>
            </div>

            <div className="auth-register-grid">
              <div className="form-group auth-register-field">
                <label htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...register('password')}
                />
                {errors.password ? <p className="auth-field-error">{errors.password.message}</p> : null}
              </div>
              <div className="form-group auth-register-field">
                <label htmlFor="reg-cpassword">Confirm Password</label>
                <input
                  id="reg-cpassword"
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...register('cpassword')}
                />
                {errors.cpassword ? <p className="auth-field-error">{errors.cpassword.message}</p> : null}
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-group">
                <input type="checkbox" {...register('terms')} />
                <span className="checkbox-group-label auth-register-terms">
                  I agree to the{' '}
                  <a
                    href="#protocols"
                    className="text-gold"
                    onClick={(e) => {
                      e.preventDefault()
                      toast('Service protocols — see legal documentation.')
                    }}
                  >
                    Service Protocols
                  </a>{' '}
                  and{' '}
                  <a
                    href="#risk"
                    className="text-gold"
                    onClick={(e) => {
                      e.preventDefault()
                      toast('Risk warnings — trading involves risk.')
                    }}
                  >
                    Risk Warnings
                  </a>
                  .
                </span>
              </label>
              {errors.terms ? <p className="auth-field-error">{errors.terms.message}</p> : null}
            </div>

            <button type="submit" className="btn-gold pulse auth-register-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Create Account'}
            </button>
          </form>

          <div className="auth-links auth-register-links">
            Already have an institutional account? <br />
            <Link to="/login" className="text-gold auth-register-login-link">
              Secure Login Access
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="auth-page-footer auth-register-footer">
        <p>
          © {new Date().getFullYear()} RichPay International. Secure Asset Management Onboarding.
        </p>
      </footer>
    </div>
  )
}
