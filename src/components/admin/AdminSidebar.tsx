import { Link, NavLink } from 'react-router-dom'
import {
  IconArrowDownCircle,
  IconAward,
  IconBell,
  IconCalendarOff,
  IconCash,
  IconChartLine,
  IconClipboardList,
  IconCoin,
  IconPhone,
  IconFileText,
  IconGift,
  IconHierarchy,
  IconLayoutDashboard,
  IconList,
  IconPackage,
  IconPercentage,
  IconPlayerPause,
  IconQrcode,
  IconReport,
  IconSeo,
  IconShare,
  IconSettings,
  IconShieldCheck,
  IconTicket,
  IconTool,
  IconTransfer,
  IconUserPlus,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react'
import type { ComponentType } from 'react'
import { useAuthState } from '@/hooks/useAuth'
import { cn } from '@/lib/utils/cn'

type NavIcon = ComponentType<{ className?: string; stroke?: number }>

type NavItem = { to: string; label: string; icon: NavIcon; end?: boolean }

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: IconLayoutDashboard, end: true }],
  },
  {
    title: 'Members & treasury',
    items: [
      { to: '/admin/users', label: 'Users', icon: IconUsers },
      { to: '/admin/registrations-today', label: 'Registrations today', icon: IconUserPlus },
      { to: '/admin/member-investment-plans', label: 'Member plans (ROI)', icon: IconPlayerPause },
      { to: '/admin/member-balance-adjust', label: 'Member balances', icon: IconCoin },
      { to: '/admin/member-contact', label: 'Email & mobile', icon: IconPhone },
      { to: '/admin/deposits', label: 'Deposits', icon: IconCash },
      { to: '/admin/withdrawals', label: 'Withdrawals', icon: IconArrowDownCircle },
      { to: '/admin/packages', label: 'Packages', icon: IconPackage },
      { to: '/admin/package-activation-split', label: 'Activation split %', icon: IconPercentage },
    ],
  },
  {
    title: 'Compensation',
    items: [
      { to: '/admin/roi', label: 'ROI', icon: IconPercentage },
      { to: '/admin/roi-off-days', label: 'ROI off / holidays', icon: IconCalendarOff },
      { to: '/admin/sponsor', label: 'Sponsor bonus', icon: IconGift },
      { to: '/admin/referral-campaigns', label: 'Referral rewards', icon: IconAward },
      { to: '/admin/referral-share', label: 'WhatsApp invite', icon: IconShare },
      { to: '/admin/team-levels', label: 'Team levels', icon: IconHierarchy },
      { to: '/admin/ranks', label: 'Rank bonus', icon: IconAward },
    ],
  },
  {
    title: 'Income ledgers',
    items: [
      { to: '/admin/income-ledgers', label: 'Income ledgers hub', icon: IconList },
      { to: '/admin/reports/balance-adjustments', label: 'Balance adjustments', icon: IconCoin },
      { to: '/admin/reports/income-daily-roi', label: 'Daily ROI credits', icon: IconChartLine },
      { to: '/admin/reports/income-sponsor', label: 'Direct referral income', icon: IconGift },
      { to: '/admin/reports/income-team-level', label: 'Team level income', icon: IconHierarchy },
      { to: '/admin/reports/income-rank', label: 'Rank bonus payouts', icon: IconAward },
      { to: '/admin/reports/active-packages', label: 'Packages & ROI pause', icon: IconClipboardList },
      { to: '/admin/reports/peer-transfers', label: 'Member peer transfers', icon: IconTransfer },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/wallets', label: 'Wallets / withdrawals', icon: IconWallet },
      { to: '/admin/qr', label: 'QR & address', icon: IconQrcode },
      { to: '/admin/transfers', label: 'Transfers', icon: IconTransfer },
      { to: '/admin/tickets', label: 'Tickets', icon: IconTicket },
      { to: '/admin/notifications', label: 'Notifications', icon: IconBell },
    ],
  },
  {
    title: 'Content & site',
    items: [
      { to: '/admin/cms', label: 'CMS', icon: IconFileText },
      { to: '/admin/seo', label: 'SEO', icon: IconSeo },
      { to: '/admin/site', label: 'Site settings', icon: IconSettings },
    ],
  },
  {
    title: 'Governance',
    items: [
      { to: '/admin/reports', label: 'Reports', icon: IconReport },
      { to: '/admin/audit', label: 'Audit log', icon: IconShieldCheck },
      { to: '/admin/maintenance', label: 'Maintenance', icon: IconTool },
    ],
  },
]

type Props = {
  onNavigate?: () => void
  className?: string
}

export function AdminSidebar({ onNavigate, className }: Props) {
  const { profile } = useAuthState()
  const displayName = profile?.fullName?.trim() || profile?.username || 'Administrator'
  const usernameLine = profile?.username || '—'
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <aside className={cn('admin-sidebar', className)}>
      <div className="admin-sidebar-brand">
        <Link to="/admin" className="admin-brand-lockup" onClick={() => onNavigate?.()}>
          <img className="admin-brand-seal" src="/assets/images/richpay_sidebar_seal.svg" alt="" width={46} height={46} />
          <span>
            <span className="admin-brand-wordmark">Rich Pay</span>
            <p className="admin-brand-sub">Administration</p>
          </span>
        </Link>
      </div>

      <div className="admin-profile-block">
        <div className="admin-nav-avatar-shell">
          <div className="admin-nav-avatar" aria-hidden>
            <span className="admin-nav-avatar-letter">{initial}</span>
          </div>
          <span className="admin-nav-online-dot" title="Online" />
        </div>
        <div className="min-w-0 flex-1 ps-0.5">
          <h6 className="admin-nav-display-name truncate">{displayName}</h6>
          <p className="admin-nav-role">Administrator</p>
          <p className="admin-nav-meta truncate">{usernameLine}</p>
        </div>
      </div>

      <nav className="admin-nav-scroll">
        {groups.map((g) => (
          <div key={g.title} className="admin-nav-section">
            <span className="admin-menu-title">{g.title}</span>
            <ul className="m-0 list-none p-0">
              {g.items.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    end={l.end ?? false}
                    onClick={() => onNavigate?.()}
                    className={({ isActive }) => cn('admin-nav-link', isActive && 'active')}
                  >
                    <l.icon className="admin-nav-ico" stroke={1.5} />
                    <span className="min-w-0 truncate">{l.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <NavLink to="/dashboard" className="admin-back-member" onClick={() => onNavigate?.()}>
          ← Member dashboard
        </NavLink>
      </div>
    </aside>
  )
}
