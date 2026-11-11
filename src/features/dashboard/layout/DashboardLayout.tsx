import 'bootstrap/dist/css/bootstrap.min.css'
import '@/styles/dashboard-ki.css'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, Outlet } from 'react-router-dom'
import { CaretUp, X } from '@phosphor-icons/react'
import { KiDashboardHeader } from '@/components/dashboard/KiDashboardHeader'
import { KiDashboardNav } from '@/components/dashboard/KiDashboardNav'
import { useAuthState } from '@/hooks/useAuth'

export function DashboardLayout() {
  const { profile, profileLoaded } = useAuthState()
  const [mobileNav, setMobileNav] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [goTop, setGoTop] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onScroll = () => setGoTop(el.scrollTop > 200)
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileNav) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNav])

  // Close on route-driven escape / back-friendly Escape key.
  useEffect(() => {
    if (!mobileNav) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNav(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNav])

  if (profileLoaded && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  const drawer =
    mobileNav &&
    createPortal(
      <div className={`ki-drawer-root ${darkMode ? 'is-dark' : 'is-light'}`} role="presentation">
        <button
          type="button"
          className="ki-drawer-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
        <aside className="ki-drawer-panel" role="dialog" aria-modal="true" aria-label="Dashboard menu">
          <div className="ki-drawer-header">
            <span className="ki-drawer-title">Menu</span>
            <button
              type="button"
              className="ki-drawer-close"
              aria-label="Close"
              onClick={() => setMobileNav(false)}
            >
              <X size={22} weight="bold" />
            </button>
          </div>
          <div className="ki-drawer-scroll">
            <div className="ki-sidebar ki-sidebar--mobile border-0">
              <KiDashboardNav profile={profile} onNavigate={() => setMobileNav(false)} />
            </div>
          </div>
        </aside>
      </div>,
      document.body,
    )

  return (
    <div
      id="ki-dashboard-root"
      className={`ltr ${darkMode ? 'dark' : ''}`}
      data-bs-theme={darkMode ? 'dark' : 'light'}
    >
      <div className="ki-app-wrapper">
        <aside className="ki-sidebar ki-sidebar--desktop">
          <KiDashboardNav profile={profile} />
        </aside>

        {drawer}

        <div className="ki-app-main d-flex flex-column min-vh-100">
          <KiDashboardHeader
            onMenuOpen={() => setMobileNav(true)}
            themeToggle={() => setDarkMode((d) => !d)}
            darkMode={darkMode}
          />
          <div ref={mainRef} className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
            <Outlet />
          </div>
          <footer className="ki-footer">
            <div className="container-fluid px-3">
              <div className="row">
                <div className="col-12 col-md-9">
                  <p className="fw-semibold mb-0">Copyright © 2026 RichPay All rights reserved</p>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      <button
        type="button"
        className={`ki-go-top ${goTop ? 'visible' : ''}`}
        aria-label="Back to top"
        onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <CaretUp size={22} weight="bold" />
      </button>
    </div>
  )
}
