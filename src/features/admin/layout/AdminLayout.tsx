import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="flex min-h-svh bg-rich-black">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
