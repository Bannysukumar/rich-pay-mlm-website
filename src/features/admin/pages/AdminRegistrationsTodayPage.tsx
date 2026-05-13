import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { downloadExcelCsv } from '@/lib/export/reportExport'
import { db } from '@/lib/firebase'
import type { UserRole } from '@/types/models'
import { cn } from '@/lib/utils/cn'

const FETCH_LIMIT = 800

function localYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localDayStartMs(ymd: string): number | null {
  if (!ymd.trim()) return null
  const t = new Date(`${ymd}T00:00:00`).getTime()
  return Number.isNaN(t) ? null : t
}

function localDayEndMs(ymd: string): number | null {
  if (!ymd.trim()) return null
  const t = new Date(`${ymd}T23:59:59.999`).getTime()
  return Number.isNaN(t) ? null : t
}

type Row = {
  id: string
  username: string
  email: string
  fullName: string
  phone: string
  role: UserRole
  sponsorUsername: string
  sponsorUid: string
  createdAt: number
}

function mapUserDoc(id: string, x: Record<string, unknown>): Row {
  return {
    id,
    username: String(x.username ?? ''),
    email: String(x.email ?? ''),
    fullName: String(x.fullName ?? '').trim(),
    phone: String(x.phone ?? ''),
    role: (String(x.role ?? 'user') as UserRole) || 'user',
    sponsorUsername: String(x.sponsorUsername ?? ''),
    sponsorUid: String(x.sponsorUid ?? ''),
    createdAt: Number(x.createdAt ?? 0),
  }
}

export function AdminRegistrationsTodayPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => localYmd(new Date()))
  const [dateTo, setDateTo] = useState(() => localYmd(new Date()))

  useEffect(() => {
    const qRef = query(collection(db, COLLECTIONS.users), orderBy('createdAt', 'desc'), limit(FETCH_LIMIT))
    return onSnapshot(
      qRef,
      (snap) => {
        const next: Row[] = []
        snap.forEach((d) => {
          next.push(mapUserDoc(d.id, d.data() as Record<string, unknown>))
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load registrations')
        setRows([])
      },
    )
  }, [])

  const displayRows = useMemo(() => {
    const fromMs = localDayStartMs(dateFrom)
    const toMs = localDayEndMs(dateTo)
    if (fromMs == null && toMs == null) return rows
    return rows.filter((r) => {
      const ms = r.createdAt
      if (!Number.isFinite(ms) || ms <= 0) return false
      if (fromMs != null && ms < fromMs) return false
      if (toMs != null && ms > toMs) return false
      return true
    })
  }, [rows, dateFrom, dateTo])

  const onExport = useCallback(async () => {
    if (displayRows.length === 0) {
      toast.error('Nothing to export')
      return
    }
    const headers = [
      'User UID',
      'Registered (ISO UTC)',
      'Username',
      'Full name',
      'Email',
      'Phone',
      'Role',
      'Sponsor username',
      'Sponsor UID',
    ]
    const csvRows = displayRows.map((r) => [
      r.id,
      new Date(r.createdAt).toISOString(),
      r.username,
      r.fullName,
      r.email,
      r.phone,
      r.role,
      r.sponsorUsername,
      r.sponsorUid,
    ])
    try {
      downloadExcelCsv('registrations-report', headers, csvRows)
      await pushAuditLog('adminExportRegistrations', { rows: displayRows.length })
      toast.success(`Exported ${displayRows.length} rows`)
    } catch {
      toast.error('Export failed')
    }
  }, [displayRows])

  const fmt = (ms: number) =>
    ms > 0
      ? new Date(ms).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Registrations today</h1>
          <p className="text-sm text-[#9898a8]">
            New member accounts from <code className="text-[#f5e6a8]">users</code> by{' '}
            <code className="text-[#f5e6a8]">createdAt</code>. Defaults to <strong>today</strong> (local). Clear both
            dates to list the {FETCH_LIMIT} most recently created profiles loaded from Firestore.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 self-start border-[rgba(212,175,55,0.4)] text-[#f5e6a8] hover:bg-[rgba(212,175,55,0.12)]"
          disabled={displayRows.length === 0}
          onClick={() => void onExport()}
        >
          Export to Excel (CSV)
        </Button>
      </div>

      <div className="admin-panel-sheet space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6b6b7c]">Date range (local)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
          >
            Clear dates (show last {FETCH_LIMIT})
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            onClick={() => {
              const t = localYmd(new Date())
              setDateFrom(t)
              setDateTo(t)
            }}
          >
            Today only
          </Button>
          <span className="text-[11px] text-[#6b6b7c]">
            Showing {displayRows.length} of {rows.length} loaded
          </span>
        </div>
      </div>

      <div className="admin-panel-sheet overflow-hidden p-0">
        <div className="max-w-[100vw] overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[12px] text-[#c4c4ce]">
            <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                <th className="px-3 py-2.5 pl-4">Registered</th>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">Full name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Sponsor</th>
                <th className="px-3 py-2.5">User UID</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[#9898a8]">
                    Loading…
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[#9898a8]">
                    No registrations in this date range.
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[rgba(212,175,55,0.08)] hover:bg-[rgba(212,175,55,0.03)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 pl-4 text-[11px] text-[#9898a8]">{fmt(r.createdAt)}</td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-[11px] text-[#e4e4e7]" title={r.username}>
                      {r.username || '—'}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 text-[11px]" title={r.fullName}>
                      {r.fullName || '—'}
                    </td>
                    <td className="max-w-[180px] break-all px-3 py-2.5 text-[11px]">{r.email || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">{r.phone || '—'}</td>
                    <td className={cn('px-3 py-2.5 text-[11px] font-semibold', r.role === 'admin' && 'text-[#f5e6a8]')}>
                      {r.role}
                    </td>
                    <td className="max-w-[100px] truncate px-3 py-2.5 font-mono text-[11px]" title={r.sponsorUsername}>
                      {r.sponsorUsername || '—'}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-[10px] text-[#9898a8]" title={r.id}>
                      {r.id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
