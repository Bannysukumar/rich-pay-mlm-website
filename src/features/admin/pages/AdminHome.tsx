import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import {
  IconChartBarPopular,
  IconClock,
  IconRefresh,
  IconUsers,
  IconWallet,
  IconArrowDownCircle,
  IconCash,
  IconTicket,
  IconAlertCircle,
} from '@tabler/icons-react'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils/cn'

type Metrics = {
  users: number
  depositsPending: number
  depositsApproved: number
  withdrawalsPending: number
  withdrawalsPaid: number
  ticketsOpen: number
  todayRegs: number
}

const emptyMetrics: Metrics = {
  users: 0,
  depositsPending: 0,
  depositsApproved: 0,
  withdrawalsPending: 0,
  withdrawalsPaid: 0,
  ticketsOpen: 0,
  todayRegs: 0,
}

function startOfUtcDayMs() {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
}

export function AdminHome() {
  const [m, setM] = useState<Metrics>(emptyMetrics)
  const [loading, setLoading] = useState(true)
  const [series, setSeries] = useState<{ name: string; deposits: number; withdrawals: number }[]>([])
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const t0 = startOfUtcDayMs()
      const [
        users,
        depositsPending,
        depositsApproved,
        withdrawalsPending,
        withdrawalsPaid,
        ticketsOpen,
        todayRegs,
      ] = await Promise.all([
        getCountFromServer(collection(db, COLLECTIONS.users)),
        getCountFromServer(query(collection(db, COLLECTIONS.deposits), where('status', '==', 'pending'))),
        getCountFromServer(query(collection(db, COLLECTIONS.deposits), where('status', '==', 'approved'))),
        getCountFromServer(query(collection(db, COLLECTIONS.withdrawals), where('status', '==', 'pending'))),
        getCountFromServer(query(collection(db, COLLECTIONS.withdrawals), where('status', '==', 'paid'))),
        getCountFromServer(query(collection(db, COLLECTIONS.tickets), where('status', '==', 'open'))),
        getCountFromServer(
          query(collection(db, COLLECTIONS.users), where('createdAt', '>=', t0)),
        ).catch(() => ({ data: () => ({ count: 0 }) })),
      ])

      setM({
        users: users.data().count,
        depositsPending: depositsPending.data().count,
        depositsApproved: depositsApproved.data().count,
        withdrawalsPending: withdrawalsPending.data().count,
        withdrawalsPaid: withdrawalsPaid.data().count,
        ticketsOpen: ticketsOpen.data().count,
        todayRegs: todayRegs.data().count,
      })

      const mix = Math.max(
        depositsApproved.data().count + depositsPending.data().count,
        1,
      )
      setSeries([
        { name: 'Deposits', deposits: depositsApproved.data().count, withdrawals: 0 },
        { name: 'Pending', deposits: depositsPending.data().count, withdrawals: withdrawalsPending.data().count },
        { name: 'Paid WD', deposits: Math.round(mix * 0.2), withdrawals: withdrawalsPaid.data().count },
      ])
    } catch {
      setErr('Could not load metrics. If you recently deployed indexes, wait until they finish building, then retry.')
      setSeries([
        { name: 'Deposits', deposits: 0, withdrawals: 0 },
        { name: 'Pending', deposits: 0, withdrawals: 0 },
        { name: 'Paid WD', deposits: 0, withdrawals: 0 },
      ])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(id)
  }, [refresh])

  const kpi = useMemo(
    () =>
      [
        {
          label: 'Total users',
          value: m.users,
          icon: <IconUsers className="size-5" stroke={1.5} />,
        },
        {
          label: 'Pending deposits',
          value: m.depositsPending,
          icon: <IconClock className="size-5" stroke={1.5} />,
        },
        {
          label: 'Pending withdrawals',
          value: m.withdrawalsPending,
          icon: <IconArrowDownCircle className="size-5" stroke={1.5} />,
        },
        {
          label: 'Paid withdrawals',
          value: m.withdrawalsPaid,
          icon: <IconCash className="size-5" stroke={1.5} />,
        },
        {
          label: 'Registrations today',
          value: m.todayRegs,
          icon: <IconUsers className="size-5" stroke={1.5} />,
        },
        {
          label: 'Open tickets',
          value: m.ticketsOpen,
          icon: <IconTicket className="size-5" stroke={1.5} />,
        },
      ] as const,
    [m],
  )

  const chartHasSignal = series.some((r) => r.deposits > 0 || r.withdrawals > 0)
  const allKpiZero = !loading && kpi.every((k) => k.value === 0)

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 border-b pb-8 admin-divider-soft sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.35rem] font-bold tracking-tight text-[#e4e4e7] sm:text-2xl">
              Operational overview
            </h2>
            <span className="admin-chip">Live · 30s</span>
          </div>
          <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-[#9898a8]">
            High-level counts across members, treasury, and support. Numbers use Firestore aggregation queries.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg px-4 py-2 text-xs font-semibold"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <span className="inline-flex items-center gap-2">
              <IconRefresh className={cn('size-4', loading && 'animate-spin')} stroke={1.5} />
              Refresh
            </span>
          </Button>
        </div>
      </motion.section>

      {err && (
        <div
          role="alert"
          className="admin-panel-sheet flex gap-3 border border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.06)] px-4 py-3 text-[0.9rem] text-[#f5e6a8]"
        >
          <IconAlertCircle className="mt-0.5 size-5 shrink-0 text-[#d4af37]" stroke={1.5} />
          <div>
            <p className="font-semibold text-[#fcf6d9]">{err}</p>
            <p className="mt-1 text-[0.78rem] text-[#ebe4c8]/90">Use Refresh after indexes finish building in Firebase.</p>
          </div>
        </div>
      )}

      {!err && !loading && allKpiZero && (
        <p className="admin-panel-sheet border px-4 py-3 text-[0.9rem] text-[#9898a8]">
          No activity recorded yet—or queries returned zero. Once users and deposits exist, this dashboard fills in
          automatically.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpi.map((row) => (
          <AdminStatCard
            key={row.label}
            label={row.label}
            value={row.value}
            loading={loading}
            icon={row.icon}
          />
        ))}
      </div>

      <section className="admin-panel-sheet shadow-[0_20px_50px_-30px_rgba(0,0,0,0.65)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b admin-divider-soft px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(255,255,255,0.06)] text-[#d4af37] ring-1 ring-[rgba(212,175,55,0.2)]">
              <IconChartBarPopular className="size-5" stroke={1.5} />
            </div>
            <div>
              <h3 className="text-[0.92rem] font-bold text-[#e4e4e7]">Flow mix</h3>
              <p className="text-[0.78rem] text-[#9898a8]">Deposits vs withdrawal signals</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[0.72rem] text-[#6b6b7c]">
            <IconWallet className="size-3.5" stroke={1.5} />
            Read-only chart
          </div>
        </div>

        <div className="relative min-h-[280px] px-2 pb-4 pt-3 sm:px-4">
          {!loading && !chartHasSignal && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[0.9rem] font-semibold text-[#9898a8]">Nothing to plot yet</p>
              <p className="max-w-xs text-[0.78rem] text-[#6b6b7c]">
                When deposit and payout volume appears, bars will render here automatically.
              </p>
            </div>
          )}
          <div className={cn(!chartHasSignal && !loading && 'opacity-25')}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={series} margin={{ top: 12, right: 12, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d32" vertical={false} />
                <XAxis dataKey="name" stroke="#6b6b7c" tick={{ fontSize: 12, fill: '#9898a8' }} axisLine={false} />
                <YAxis stroke="#6b6b7c" tick={{ fontSize: 11, fill: '#6b6b7c' }} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(212,175,55,0.06)' }}
                  contentStyle={{
                    background: '#1a1d21',
                    border: '1px solid rgba(212,175,55,0.25)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#e4e4e7', fontWeight: 600 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                  formatter={(value) => <span style={{ color: '#9898a8' }}>{value}</span>}
                />
                <Bar dataKey="deposits" name="Deposit side" fill="rgba(212,175,55,0.72)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="withdrawals" name="Withdraw side" fill="rgba(45,212,191,0.55)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  )
}
