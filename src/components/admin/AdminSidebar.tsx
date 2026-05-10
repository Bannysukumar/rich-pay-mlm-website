import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils/cn'

const links: { to: string; label: string }[] = [
  { to: '/admin', label: 'Dashboard Analytics' },
  { to: '/admin/users', label: 'User Management' },
  { to: '/admin/deposits', label: 'Deposit Management' },
  { to: '/admin/withdrawals', label: 'Withdrawal Management' },
  { to: '/admin/packages', label: 'Package Management' },
  { to: '/admin/roi', label: 'ROI Settings' },
  { to: '/admin/sponsor', label: 'Sponsor Bonus' },
  { to: '/admin/team-levels', label: 'Team Level Settings' },
  { to: '/admin/ranks', label: 'Rank Bonus Settings' },
  { to: '/admin/wallets', label: 'Wallet Settings' },
  { to: '/admin/qr', label: 'QR & Wallet Address' },
  { to: '/admin/transfers', label: 'Transfer Settings' },
  { to: '/admin/tickets', label: 'Ticket Management' },
  { to: '/admin/notifications', label: 'Notifications' },
  { to: '/admin/cms', label: 'CMS Management' },
  { to: '/admin/seo', label: 'SEO Settings' },
  { to: '/admin/site', label: 'Site Settings' },
  { to: '/admin/reports', label: 'Reports & Exports' },
  { to: '/admin/audit', label: 'Audit Logs' },
  { to: '/admin/maintenance', label: 'Maintenance Mode' },
]

export function AdminSidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-red-900/30 bg-[#0c0505]">
      <div className="border-b border-red-900/40 p-5">
        <div className="font-display text-sm font-semibold tracking-[0.25em] text-red-500">CONTROL</div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-600">Administration</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/admin'}
            className={({ isActive }) =>
              cn(
                'block px-4 py-2 text-xs transition-colors',
                isActive ? 'bg-red-600/20 text-red-300' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <NavLink
        to="/dashboard"
        className="border-t border-red-900/40 p-4 text-xs text-zinc-500 hover:text-zinc-300"
      >
        ← Member dashboard
      </NavLink>
    </aside>
  )
}
