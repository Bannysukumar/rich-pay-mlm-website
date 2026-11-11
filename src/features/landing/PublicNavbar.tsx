import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthState } from '@/hooks/useAuth'
import { cn } from '@/lib/utils/cn'

function Logo() {
  const [src, setSrc] = useState('/assets/images/richpay_logo.png')
  return (
    <img
      src={src}
      alt="RichPay Logo"
      className="h-10 w-auto"
      onError={() => setSrc('/assets/images/richpay_logo.svg')}
    />
  )
}

export function PublicNavbar({ registerCta = 'Register' }: { registerCta?: string }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { firebaseUid, profileLoaded, profile } = useAuthState()
  const canEnterDashboard =
    profileLoaded && Boolean(firebaseUid) && (!profile || !profile.blocked)

  const closeMenu = () => setOpen(false)

  // Close on route change and keep page from scrolling under an open mobile menu.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    const root = document.querySelector('.landing-root')
    if (!root) return
    root.classList.toggle('nav-open', open)
    return () => root.classList.remove('nav-open')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {open ? (
        <button
          type="button"
          className="landing-nav-backdrop"
          aria-label="Close menu"
          onClick={closeMenu}
        />
      ) : null}
    <motion.nav
      id="landing-navbar"
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Link to="/" className="logo" onClick={closeMenu}>
        <Logo />
      </Link>
      <ul className={cn('nav-links', open && 'open')} id="landing-mobile-nav">
        <li>
          <Link to="/" className={cn(pathname === '/' && 'active')} onClick={closeMenu}>
            Home
          </Link>
        </li>
        <li>
          <Link
            to="/plans"
            className={cn(pathname === '/plans' && 'text-gold')}
            onClick={closeMenu}
          >
            Investment Plans
          </Link>
        </li>
        <li>
          <Link
            to="/contact"
            className={cn(pathname === '/contact' && 'text-gold')}
            onClick={closeMenu}
          >
            Contact Us
          </Link>
        </li>
        <li>
          {canEnterDashboard ? (
            <Link
              to="/dashboard"
              className={cn(pathname.startsWith('/dashboard') && 'text-gold')}
              onClick={closeMenu}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className={cn((pathname === '/login' || pathname === '/register/success') && 'text-gold')}
              onClick={closeMenu}
            >
              Login
            </Link>
          )}
        </li>
        <li>
          {canEnterDashboard ? (
            <Link to="/dashboard/wallet/deposit" className="btn-gold" onClick={closeMenu}>
              My wallet
            </Link>
          ) : (
            <Link to="/register" className="btn-gold" onClick={closeMenu}>
              {registerCta}
            </Link>
          )}
        </li>
      </ul>
      <button
        type="button"
        className="mobile-menu-btn"
        aria-label={open ? 'Close menu' : 'Menu'}
        aria-expanded={open}
        aria-controls="landing-mobile-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <title>{open ? 'Close menu' : 'Menu'}</title>
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" />
              <line x1="6" y1="18" x2="18" y2="6" strokeWidth="2" />
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2" />
              <line x1="3" y1="6" x2="21" y2="6" strokeWidth="2" />
              <line x1="3" y1="18" x2="21" y2="18" strokeWidth="2" />
            </>
          )}
        </svg>
      </button>
    </motion.nav>
    </>
  )
}
