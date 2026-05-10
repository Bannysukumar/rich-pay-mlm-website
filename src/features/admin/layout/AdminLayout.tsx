import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import '@/styles/admin-panel.css'
import { cn } from '@/lib/utils/cn'

export function AdminLayout() {
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div id="admin-dashboard-root" className="ltr dark">
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
          <AdminHeader onMenuOpen={() => setMobileNav(true)} />
          <div className="admin-content">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
