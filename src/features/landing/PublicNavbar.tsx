import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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

  return (
    <motion.nav
      id="landing-navbar"
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Link to="/" className="logo" onClick={() => setOpen(false)}>
        <Logo />
      </Link>
      <ul className={cn('nav-links', open && 'open')}>
        <li>
          <Link to="/" className={cn(pathname === '/' && 'active')} onClick={() => setOpen(false)}>
            Home
          </Link>
        </li>
        <li>
          <Link
            to="/plans"
            className={cn(pathname === '/plans' && 'text-gold')}
            onClick={() => setOpen(false)}
          >
            Investment Plans
          </Link>
        </li>
        <li>
          <Link
            to="/contact"
            className={cn(pathname === '/contact' && 'text-gold')}
            onClick={() => setOpen(false)}
          >
            Contact Us
          </Link>
        </li>
        <li>
          <Link
            to="/login"
            className={cn((pathname === '/login' || pathname === '/register/success') && 'text-gold')}
            onClick={() => setOpen(false)}
          >
            Login
          </Link>
        </li>
        <li>
          <Link to="/register" className="btn-gold" onClick={() => setOpen(false)}>
            {registerCta}
          </Link>
        </li>
      </ul>
      <button
        type="button"
        className="mobile-menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <title>Menu</title>
          <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2" />
          <line x1="3" y1="6" x2="21" y2="6" strokeWidth="2" />
          <line x1="3" y1="18" x2="21" y2="18" strokeWidth="2" />
        </svg>
      </button>
    </motion.nav>
  )
}
