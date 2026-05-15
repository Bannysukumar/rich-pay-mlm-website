import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

type Props = {
  label: string
  value: number | string
  icon: ReactNode
  loading?: boolean
  hint?: string
}

export function AdminStatCard({ label, value, icon, loading, hint }: Props) {
  return (
    <div className={cn('admin-stat-card')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="admin-stat-label text-[0.68rem] font-semibold uppercase tracking-[0.1em]">{label}</p>
          {loading ? (
            <div className="admin-stat-skeleton mt-3 h-8 w-20 animate-pulse rounded-md" aria-hidden />
          ) : (
            <p className="admin-stat-value mt-2 tabular-nums text-[1.45rem] font-bold tracking-tight">{value}</p>
          )}
          {hint && !loading && <p className="admin-stat-hint mt-1 text-[0.72rem]">{hint}</p>}
        </div>
        <div className="admin-stat-icon shrink-0 [&_svg]:size-5">{icon}</div>
      </div>
    </div>
  )
}
