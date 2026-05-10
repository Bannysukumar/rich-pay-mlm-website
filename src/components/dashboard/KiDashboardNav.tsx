import { useState } from 'react'
import { Collapse, Dropdown } from 'react-bootstrap'
import { Link, NavLink } from 'react-router-dom'
import {
  IconBriefcase,
  IconCertificate,
  IconChartBar,
  IconGift,
  IconHome,
  IconLayoutGrid,
  IconLogout,
  IconMapPin,
  IconStack2,
  IconTable,
  IconWallet,
} from '@tabler/icons-react'
import { ChatsCircle, Gear, Plus, Scroll, SignOut, UserCircle } from '@phosphor-icons/react'
import {
  CurrencyCircleDollar,
  Envelope,
  GooglePhotosLogo,
  Notebook,
  ProjectorScreenChart,
  ShoppingBagOpen,
} from '@phosphor-icons/react'
import type { UserProfile } from '@/types/models'

type Props = {
  profile: UserProfile | null
  onNavigate?: () => void
}

type Sub = { to: string; label: string }

type Group = {
  id: string
  label: string
  icon: React.ReactNode
  children: Sub[]
}

const groups: Group[] = [
  {
    id: 'dashboard',
    label: 'dashboard',
    icon: <IconHome size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/dashboard/profile', label: 'Profile' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    icon: <IconStack2 size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/direct-referrals', label: 'Direct Referrals' },
      { to: '/dashboard/all-downlines', label: 'All Downlines' },
    ],
  },
  {
    id: 'deposits',
    label: 'Deposits',
    icon: <IconBriefcase size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/deposits/create-qr', label: 'Create QR' },
      { to: '/dashboard/deposits/view-qr', label: 'View QR' },
      { to: '/dashboard/deposits/history', label: 'Deposit History' },
    ],
  },
  {
    id: 'package',
    label: 'Package',
    icon: <IconCertificate size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/package/topup', label: 'Topup' },
      { to: '/dashboard/package/history', label: 'Topup History' },
    ],
  },
  {
    id: 'transferrep',
    label: 'Transfer Report',
    icon: <IconGift size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/transfers/outward', label: 'Outward Transfers' },
      { to: '/dashboard/transfers/inward', label: 'Inward Transfers' },
    ],
  },
  {
    id: 'wallet',
    label: 'Wallet',
    icon: <IconWallet size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/wallet/activation', label: 'Activation Wallet' },
      { to: '/dashboard/wallet/cash', label: 'Cash Wallet' },
      { to: '/dashboard/wallet/deposit', label: 'Deposit Wallet' },
      { to: '/dashboard/wallet/convert', label: 'Convert' },
      { to: '/dashboard/wallet/transfer', label: 'Transfer' },
    ],
  },
  {
    id: 'income',
    label: 'Income Report',
    icon: <IconMapPin size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/income/daily-profits', label: 'Daily Profits' },
      { to: '/dashboard/income/sponsor-bonus', label: 'Sponsor Bonus' },
      { to: '/dashboard/income/team-level', label: 'Team Level Bonus' },
      { to: '/dashboard/income/ranking', label: 'Ranking Bonus' },
    ],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    icon: <IconChartBar size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/tickets/create', label: 'Create Ticket' },
      { to: '/dashboard/tickets/list', label: 'Your Tickets' },
      { to: '/dashboard/tickets/view', label: 'View Reply' },
    ],
  },
  {
    id: 'withdrawals',
    label: 'Withdrawals',
    icon: <IconTable size={20} stroke={1.5} />,
    children: [
      { to: '/dashboard/withdraw', label: 'Withdraw' },
      { to: '/dashboard/withdraw/report', label: 'Withdraw Report' },
    ],
  },
]

const singles: { to: string; label: string; icon: React.ReactNode }[] = [
  { to: '/dashboard/referral-link', label: 'Referal Link', icon: <IconLayoutGrid size={20} stroke={1.5} /> },
  {
    to: '/dashboard/account/password',
    label: 'Change Password',
    icon: <IconWallet size={20} stroke={1.5} />,
  },
  { to: '/logout', label: 'Logout', icon: <IconLogout size={20} stroke={1.5} /> },
]

export function KiDashboardNav({ profile, onNavigate }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    dashboard: true,
  })

  const displayName = profile?.fullName?.trim() || 'Member'
  const usernameLine = profile?.username || '—'

  return (
    <>
      <div className="ki-app-logo text-center">
        <Link to="/dashboard" className="d-inline-block" onClick={onNavigate}>
          <img className="ki-logo-img" src="/assets/images/richpay_logo.svg" alt="Rich Pay" />
        </Link>
      </div>

      <div className="ki-profile-block">
        <div className="ki-avatar-wrap d-flex align-items-center justify-content-center">
          <span className="text-white small fw-bold">{displayName.slice(0, 1).toUpperCase()}</span>
        </div>
        <div className="flex-grow-1 overflow-hidden">
          <h6 className="text-primary mb-0 text-truncate" style={{ color: 'var(--ki-gold)', fontSize: '0.9rem' }}>
            {displayName}
          </h6>
          <p className="text-muted mb-0" style={{ fontSize: '0.75rem' }}>
            {usernameLine}
          </p>
        </div>

        <Dropdown align="end">
          <Dropdown.Toggle
            variant="link"
            className="text-secondary p-0 border-0"
            aria-label="Account menu"
            bsPrefix="btn"
          >
            <Gear size={22} weight="regular" />
          </Dropdown.Toggle>
          <Dropdown.Menu variant="dark" className="shadow">
            <Dropdown.Item as={Link} to="/dashboard/profile" onClick={onNavigate}>
              <UserCircle className="me-2" size={20} />
              Profile Details
            </Dropdown.Item>
            <Dropdown.Item as={Link} to="/dashboard/account/password" onClick={onNavigate}>
              <Gear className="me-2" size={20} />
              Change Password
            </Dropdown.Item>
            <Dropdown.Item as={Link} to="/dashboard/deposits/create-qr" onClick={onNavigate}>
              <Plus className="me-2" size={20} />
              Add Fund
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item as={Link} to="/logout" className="text-danger" onClick={onNavigate}>
              <SignOut className="me-2" size={20} />
              Log Out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <div className="ki-nav-scroll">
        <span className="ki-menu-title">Home</span>
        <ul className="list-unstyled px-2 mb-0">
          {groups.map((g) => {
            const isOpen = open[g.id] ?? false
            return (
              <li key={g.id} className="mb-1">
                <button
                  type="button"
                  className="ki-nav-parent"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((s) => ({ ...s, [g.id]: !isOpen }))}
                >
                  {g.icon}
                  <span className="text-capitalize flex-grow-1">{g.label}</span>
                </button>
                <Collapse in={isOpen}>
                  <ul className="list-unstyled mb-2 pb-1">
                    {g.children.map((c) => (
                      <li key={c.to}>
                        <NavLink
                          to={c.to}
                          end={c.to === '/dashboard'}
                          onClick={onNavigate}
                          className={({ isActive }) => `ki-nav-sublink d-block ${isActive ? 'active' : ''}`}
                        >
                          {c.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </Collapse>
              </li>
            )
          })}

          {singles.map((s) => (
            <li key={s.to} className="mb-1">
              <NavLink
                to={s.to}
                onClick={onNavigate}
                className={({ isActive }) => `ki-nav-single ${isActive ? 'active' : ''}`}
              >
                {s.icon}
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** App grid links for header offcanvas (matches PHP quick links) */
export function KiHeaderAppLinks({ onNavigate }: { onNavigate?: () => void }) {
  const cell = 'd-flex flex-column align-items-center justify-content-center text-center text-decoration-none rounded-3 py-3 px-2'
  return (
    <div className="row row-cols-3 g-2 ki-apps-grid">
      <div className="col">
        <Link to="/dashboard/withdraw" className={`${cell} text-primary bg-dark`} onClick={onNavigate}>
          <ShoppingBagOpen className="text-warning mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Withdraw</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/tickets/create" className={`${cell} text-danger bg-dark`} onClick={onNavigate}>
          <Envelope className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Compose</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/tickets/view" className={`${cell} text-success bg-dark`} onClick={onNavigate}>
          <ChatsCircle className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Inbox</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/direct-referrals" className={`${cell} text-warning bg-dark`} onClick={onNavigate}>
          <ProjectorScreenChart className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Directs</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/referral-link" className={`${cell} text-info bg-dark`} onClick={onNavigate}>
          <Scroll className="mb-1" size={32} />
          <p className="mb-0 small fw-medium text-light">Referral Link</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard" className={`${cell} text-secondary bg-dark`} onClick={onNavigate}>
          <Notebook className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Report</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/deposits/create-qr" className={`${cell} text-danger bg-dark`} onClick={onNavigate}>
          <Plus className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Deposit</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/package/topup" className={`${cell} text-warning bg-dark`} onClick={onNavigate}>
          <CurrencyCircleDollar className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light txt-ellipsis-1">Topup</p>
        </Link>
      </div>
      <div className="col">
        <Link to="/dashboard/wallet/transfer" className={`${cell} text-primary bg-dark`} onClick={onNavigate}>
          <GooglePhotosLogo className="mb-1" size={32} weight="light" />
          <p className="mb-0 small fw-medium text-light">Transfer</p>
        </Link>
      </div>
    </div>
  )
}
