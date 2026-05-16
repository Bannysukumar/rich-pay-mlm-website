import 'bootstrap/dist/css/bootstrap.min.css'
import '@/styles/dashboard-ki.css'

import { useEffect, useRef, useState } from 'react'
import { Offcanvas } from 'react-bootstrap'
import { Navigate, Outlet } from 'react-router-dom'
import { CaretUp } from '@phosphor-icons/react'
import { KiDashboardHeader } from '@/components/dashboard/KiDashboardHeader'
import { KiDashboardNav } from '@/components/dashboard/KiDashboardNav'
import { useAuthState } from '@/hooks/useAuth'

export function DashboardLayout() {
  const { profile, profileLoaded } = useAuthState()
  const [mobileNav, setMobileNav] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [goTop, setGoTop] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  /** Keep mobile menu in this subtree so `#ki-dashboard-root …` CSS applies (default portal is `body`). */
  const dashboardRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onScroll = () => setGoTop(el.scrollTop > 200)
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  if (profileLoaded && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return (
    <div
      id="ki-dashboard-root"
      ref={dashboardRootRef}
      className={`ltr ${darkMode ? 'dark' : ''}`}
      data-bs-theme={darkMode ? 'dark' : 'light'}
    >
      <div className="ki-app-wrapper">
        {/* Desktop sidebar */}
        <aside className="ki-sidebar ki-sidebar--desktop flex-column">
          <KiDashboardNav profile={profile} />
        </aside>

        {/* Mobile menu */}
        <Offcanvas
          show={mobileNav}
          onHide={() => setMobileNav(false)}
          placement="start"
          container={dashboardRootRef}
          className="p-0"
          style={{ maxWidth: 300 }}
        >
          <Offcanvas.Header closeButton closeVariant="white" className="border-secondary bg-dark text-light">
            <Offcanvas.Title className="text-warning">Menu</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body className="p-0 bg-dark">
            <div className="ki-sidebar d-flex flex-column border-0">
              <KiDashboardNav profile={profile} onNavigate={() => setMobileNav(false)} />
            </div>
          </Offcanvas.Body>
        </Offcanvas>

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
