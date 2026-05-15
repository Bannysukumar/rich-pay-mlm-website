import { IconMenu2, IconMoon, IconSun } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { SquaresFour } from '@phosphor-icons/react'
import { useAuthState } from '@/hooks/useAuth'
import { cn } from '@/lib/utils/cn'

type Props = {
  onMenuOpen?: () => void
  darkMode: boolean
  onToggleTheme: () => void
}

export function AdminHeader({ onMenuOpen, darkMode, onToggleTheme }: Props) {
  const { profile } = useAuthState()
  const name = profile?.fullName || profile?.username || 'Administrator'

  return (
    <header className="admin-header-main sticky top-0 z-[1020]">
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
          <button
            type="button"
            aria-label="Open navigation"
            className="admin-head-icon lg:hidden"
            onClick={onMenuOpen}
          >
            <IconMenu2 className="size-[22px]" stroke={1.5} />
          </button>
          <span className="admin-head-icon hidden lg:inline-flex">
            <SquaresFour size={22} weight="bold" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="admin-head-kicker truncate text-[0.72rem] font-semibold uppercase tracking-[0.14em]">
              Rich Pay
            </p>
            <h1 className="admin-head-title truncate text-[1rem] font-bold leading-tight sm:text-[1.05rem]">
              Administrator
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            className="admin-head-icon"
            onClick={onToggleTheme}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? <IconSun className="size-[22px]" stroke={1.5} /> : <IconMoon className="size-[22px]" stroke={1.5} />}
          </button>
          <div className="hidden max-w-[200px] text-right leading-tight md:block lg:max-w-[280px]">
            <div className="admin-head-user-name truncate text-[0.9rem] font-semibold">{name}</div>
            <div className="admin-head-user-email truncate font-mono text-[0.7rem]">{profile?.email ?? '—'}</div>
          </div>
          <Link
            to="/dashboard"
            className={cn(
              'rounded-lg border px-3 py-2 text-center text-[0.8rem] font-semibold no-underline transition-colors',
              'border-[rgba(212,175,55,0.25)] bg-[rgba(212,175,55,0.06)] text-[#d4af37]',
              'hover:border-[rgba(212,175,55,0.45)] hover:bg-[rgba(212,175,55,0.12)] hover:text-[#f0d878]',
            )}
          >
            Member area
          </Link>
          <Link
            to="/logout"
            className="rounded-lg bg-[#dc2626] px-3 py-2 text-center text-[0.8rem] font-semibold text-white no-underline shadow-sm hover:bg-[#ef4444]"
          >
            Log out
          </Link>
        </div>
      </div>
    </header>
  )
}
