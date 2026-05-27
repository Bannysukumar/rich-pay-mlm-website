import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { PublicNavbar } from '@/features/landing/PublicNavbar'
import '@/features/landing/landing.css'
import { isRegisterSuccessState } from './registerSuccessState'

const SITE_HOST = 'richpay.live'

export function RegisterSuccessPage() {
  const { state } = useLocation()

  useEffect(() => {
    document.title = 'Transaction Status | RichPay Access Hub'
  }, [])

  if (!isRegisterSuccessState(state)) {
    return <Navigate to="/register" replace />
  }

  const { displayName, userId, password, transactionPassword, referenceId } = state
  const greeting = displayName.trim() || 'Member'

  return (
    <div className="landing-root auth-page-shell register-success-shell">
      <div className="blob blob-1" aria-hidden />
      <div className="blob blob-2" aria-hidden />

      <PublicNavbar registerCta="REGISTER" />

      <main className="auth-main register-success-main">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="card glass register-success-outer"
        >
          <div className="register-status-card">
            <div className="register-status-icon register-status-icon--success" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2 className="register-status-heading">Transaction Successful</h2>

            <div className="register-status-message">
              <p>
                Dear {greeting},
                <br />
                Welcome to {SITE_HOST}
                <br />
                Your UserID - {userId}.
                <br />
                Password - {password}.
                <br />
                Transaction Password - {transactionPassword}.
                <br />
                Login to your Member Area to refer more people and earn more..
              </p>
            </div>

            <div className="register-status-btn-group">
              <Link to="/" className="register-btn-outline">
                Return Home
              </Link>
            </div>

            <div className="register-status-foot">
              <span className="register-status-lock" aria-hidden>
                🔒
              </span>{' '}
              Secure transaction logged <span className="register-status-diamond">◆</span> Reference ID: {referenceId}
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="auth-page-footer register-success-page-footer">
        <p>© {new Date().getFullYear()} RichPay International. Multi-Layer SSL Security Enabled.</p>
      </footer>
    </div>
  )
}
