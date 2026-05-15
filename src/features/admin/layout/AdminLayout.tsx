import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import '@/styles/admin-panel.css'
import { cn } from '@/lib/utils/cn'

const ADMIN_THEME_KEY = 'richpay-admin-dark'

function readStoredDark(): boolean {
  try {
    return localStorage.getItem(ADMIN_THEME_KEY) !== '0'
  } catch {
    return true
  }
}

export function AdminLayout() {
  const [mobileNav, setMobileNav] = useState(false)
  const [darkMode, setDarkMode] = useState(() => readStoredDark())

  const toggleTheme = useCallback(() => {
    setDarkMode((d) => {
      const next = !d
      try {
        localStorage.setItem(ADMIN_THEME_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  useEffect(() => {
    const prev = document.body.style.backgroundColor
    if (!darkMode) {
      document.body.style.backgroundColor = '#f4f4f7'
    } else {
      document.body.style.backgroundColor = ''
    }
    return () => {
      document.body.style.backgroundColor = prev
    }
  }, [darkMode])

  return (
    <div id="admin-dashboard-root" className={cn('ltr', darkMode && 'dark')}>
      <div className="admin-app-wrapper">
        {mobileNav && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[1030] bg-black/65 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}

        <AdminSidebar
          onNavigate={() => setMobileNav(false)}
          className={cn(
            'fixed inset-y-0 left-0 z-[1045] transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0',
            mobileNav ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:shadow-none',
          )}
        />

        <div className="admin-app-main">
          <AdminHeader
            onMenuOpen={() => setMobileNav(true)}
            darkMode={darkMode}
            onToggleTheme={toggleTheme}
          />
          <div className="admin-content">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
