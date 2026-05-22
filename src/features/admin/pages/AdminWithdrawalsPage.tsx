import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { adminWithdrawalUpdateCallable } from '@/lib/api/adminCallables'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { rowMsInLocalDateRange } from '@/lib/admin/localDateRange'
import { COLLECTIONS } from '@/lib/constants'
import { downloadExcelCsv } from '@/lib/export/reportExport'
import { db } from '@/lib/firebase'
import type { WithdrawStatus } from '@/types/models'
import { cn } from '@/lib/utils/cn'

type Row = {
  id: string
  userId: string
  /** Member-submitted USDT BEP-20 payout address at request time. */
  address: string
  amountGross: number
  fee: number
  amountNet: number
  status: WithdrawStatus
  txId?: string
  ms: number
}

type ProfileLite = {
  username: string
  fullName: string
  email: string
  phone: string
}

const CHUNK = 30

async function fetchUserProfiles(ids: string[]): Promise<Map<string, ProfileLite>> {
  const map = new Map<string, ProfileLite>()
  const unique = [...new Set(ids)].filter(Boolean)
  for (let i = 0; i < unique.length; i += CHUNK) {
    const part = unique.slice(i, i + CHUNK)
    try {
      const qs = query(collection(db, COLLECTIONS.users), where(documentId(), 'in', part))
      const snap = await getDocs(qs)
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>
        map.set(d.id, {
          username: String(x.username ?? ''),
          fullName: String(x.fullName ?? '').trim(),
          email: String(x.email ?? ''),
          phone: String(x.phone ?? ''),
        })
      })
    } catch {
      toast.error('Could not load some user profiles for withdrawals')
    }
  }
  return map
}

function depositCreatedMs(raw: Record<string, unknown>): number {
  const ts = raw.createdAt as { toMillis?: () => number } | undefined
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
  return Number(raw.createdAt ?? 0)
}

function WdBtn({
  children,
  onClick,
  variant,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  variant: 'gold' | 'muted' | 'danger'
  disabled?: boolean
}) {
  const base =
    'rounded-lg px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40'
  const styles =
    variant === 'danger'
      ? 'bg-[#dc2626] text-white hover:bg-[#ef4444]'
      : variant === 'gold'
        ? 'border border-[rgba(212,175,55,0.45)] bg-[rgba(212,175,55,0.1)] text-[#f5e6a8] hover:bg-[rgba(212,175,55,0.18)]'
        : 'border border-[#52525b] bg-[rgba(63,63,70,0.35)] text-[#e4e4e7] hover:bg-[rgba(63,63,70,0.55)]'

  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn(base, styles)}>
      {children}
    </button>
  )
}

export function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | WithdrawStatus>('all')
  const [txHash, setTxHash] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const refreshProfiles = useCallback(async (uids: string[]) => {
    if (uids.length === 0) return
    const m = await fetchUserProfiles(uids)
    setProfiles(m)
  }, [])

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.withdrawals), orderBy('createdAt', 'desc'), limit(250))
    return onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>
          next.push({
            id: d.id,
            userId: String(x.userId ?? ''),
            address: String(x.address ?? x.walletAddress ?? x.usdtAddress ?? '').trim(),
            amountGross: Number(x.amountGross ?? x.amount ?? 0),
            fee: Number(x.fee ?? 0),
            amountNet: Number(x.amountNet ?? x.net ?? 0),
            status: (String(x.status ?? 'pending') as WithdrawStatus) || 'pending',
            txId: x.txId != null ? String(x.txId) : undefined,
            ms: depositCreatedMs(x),
          })
        })
        setRows(next)
        setLoading(false)
        void refreshProfiles(next.map((r) => r.userId))
      },
      () => {
        setLoading(false)
        toast.error('Could not subscribe withdrawals')
      },
    )
  }, [refreshProfiles])

  const filtered = useMemo(() => {
    const byStatus = filter === 'all' ? rows : rows.filter((r) => r.status === filter)
    const qq = search.trim().toLowerCase()
    let list = byStatus
    if (qq) {
      list = byStatus.filter((r) => {
        const p = profiles.get(r.userId)
        const username = (p?.username ?? '').toLowerCase()
        const fullName = (p?.fullName ?? '').toLowerCase()
        const email = (p?.email ?? '').toLowerCase()
        const phone = (p?.phone ?? '').toLowerCase()
        if (username.includes(qq) || fullName.includes(qq) || email.includes(qq) || phone.includes(qq)) return true
        if (r.userId.toLowerCase().includes(qq)) return true
        if (r.id.toLowerCase().includes(qq)) return true
        if (r.address.toLowerCase().includes(qq)) return true
        return false
      })
    }
    return list.filter((r) => rowMsInLocalDateRange(r.ms, dateFrom, dateTo))
  }, [filter, rows, search, profiles, dateFrom, dateTo])

  const onExportExcel = useCallback(async () => {
    if (filtered.length === 0) {
      toast.error('Nothing to export')
      return
    }
    const headers = [
      'S.No.',
      'Withdrawal document ID',
      'Submitted (ISO UTC)',
      'Username',
      'Full name',
      'Email',
      'Phone',
      'User UID',
      'Payout wallet address',
      'Amount gross USDT',
      'Fee USDT',
      'Amount net USDT',
      'Status',
      'TXID',
    ]
    const dataRows = filtered.map((w, index) => {
      const p = profiles.get(w.userId)
      return [
        String(index + 1),
        w.id,
        w.ms > 0 ? new Date(w.ms).toISOString() : '',
        p?.username ?? '',
        p?.fullName ?? '',
        p?.email ?? '',
        p?.phone ?? '',
        w.userId,
        w.address,
        w.amountGross.toFixed(2),
        w.fee.toFixed(2),
        w.amountNet.toFixed(2),
        w.status,
        w.txId ?? '',
      ]
    })
    try {
      downloadExcelCsv('withdrawals-admin', headers, dataRows)
      await pushAuditLog('adminExportWithdrawals', { rows: filtered.length })
      toast.success(`Exported ${filtered.length} rows — open the CSV in Excel`)
    } catch {
      toast.error('Export failed')
    }
  }, [filtered, profiles])

  const exec = async (id: string, next: 'processing' | 'approved' | 'rejected' | 'paid') => {
    try {
      await adminWithdrawalUpdateCallable({
        withdrawalId: id,
        next,
        txHash: next === 'paid' ? txHash.trim() : undefined,
      })
      await pushAuditLog('adminWithdrawalCommand', { id, next })
      toast.success(`Withdrawal ${next}`)
      if (next === 'paid') setTxHash('')
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Action failed'
      toast.error(msg)
    }
  }

  const fmt = (ms: number) =>
    ms
      ? new Date(ms).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '—'

  const statusStyle = (s: WithdrawStatus) => {
    if (s === 'paid') return 'text-[#4ade80]'
    if (s === 'rejected') return 'text-[#f87171]'
    if (s === 'processing') return 'text-[#38bdf8]'
    if (s === 'approved') return 'text-[#f5e6a8]'
    return 'text-[#c4c4ce]'
  }

  const filterKeys = ['all', 'pending', 'processing', 'approved', 'rejected', 'paid'] as const

  const colSpan = 13

  const actionCell = (w: Row) => {
    const hasTx = Boolean(txHash.trim())
    const pending = w.status === 'pending'
    const processing = w.status === 'processing'
    const approved = w.status === 'approved'

    if (w.status === 'rejected' || w.status === 'paid') {
      return <span className="text-center text-[10px] font-medium text-[#6b6b7c]">—</span>
    }

    return (
      <div className="flex flex-col items-stretch gap-1.5">
        {pending && (
          <>
            <WdBtn variant="muted" onClick={() => void exec(w.id, 'processing')}>
              Processing
            </WdBtn>
            <WdBtn variant="gold" onClick={() => void exec(w.id, 'approved')}>
              Approve
            </WdBtn>
            <WdBtn variant="danger" onClick={() => void exec(w.id, 'rejected')}>
              Reject
            </WdBtn>
            <WdBtn variant="gold" disabled={!hasTx} onClick={() => void exec(w.id, 'paid')}>
              Mark paid
            </WdBtn>
          </>
        )}
        {processing && (
          <>
            <WdBtn variant="gold" onClick={() => void exec(w.id, 'approved')}>
              Approve
            </WdBtn>
            <WdBtn variant="danger" onClick={() => void exec(w.id, 'rejected')}>
              Reject
            </WdBtn>
            <WdBtn variant="gold" disabled={!hasTx} onClick={() => void exec(w.id, 'paid')}>
              Mark paid
            </WdBtn>
          </>
        )}
        {approved && (
          <>
            <WdBtn variant="muted" onClick={() => void exec(w.id, 'processing')}>
              Processing
            </WdBtn>
            <WdBtn variant="gold" disabled={!hasTx} onClick={() => void exec(w.id, 'paid')}>
              Mark paid
            </WdBtn>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Withdrawal Management</h1>
          <p className="text-sm text-[#9898a8]">
            Rejecting pending or processing requests refunds the member automatically. Use <strong>Processing</strong> when
            payout work has started. Mark <strong>Paid</strong> with a blockchain TX hash.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 self-start border-[rgba(212,175,55,0.4)] text-[#f5e6a8] hover:bg-[rgba(212,175,55,0.12)]"
          disabled={filtered.length === 0}
          onClick={() => void onExportExcel()}
        >
          Export to Excel (CSV)
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="admin-panel-sheet min-w-[min(100%,280px)] flex-1 space-y-2 p-3 sm:max-w-md">
          <Label>Search by name, username, email, or phone</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Jane Doe, dfhgrug, or user@mail.com"
            autoComplete="off"
          />
          <p className="text-[10px] text-[#6b6b7c]">Also matches payout wallet address, user UID, or withdrawal document id.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                filter === key
                  ? 'border-[#d4af37] bg-[rgba(212,175,55,0.15)] text-[#f5e6a8]'
                  : 'border-[rgba(212,175,55,0.2)] text-[#9898a8] hover:border-[rgba(212,175,55,0.35)] hover:text-[#e4e4e7]'
              }`}
            >
              {key === 'all' ? 'All' : key}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-panel-sheet space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6b6b7c]">Submitted date range (local)</p>
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
            Clear dates
          </Button>
          <span className="text-[11px] text-[#6b6b7c]">
            Showing {filtered.length} of {rows.length} loaded (after status, search, and date filters).
          </span>
        </div>
      </div>

      <div className="admin-panel-sheet space-y-2 p-4">
        <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x… / explorer hash" />
      </div>

      <div className="admin-panel-sheet overflow-hidden p-0">
        <div className="max-w-[100vw] overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-[12px] text-[#c4c4ce]">
            <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                <th className="sticky left-0 z-[2] w-12 min-w-[48px] bg-[#1a1d21] px-2 py-2.5 pl-4 text-center shadow-[inset_-1px_0_0_rgba(212,175,55,0.08)]">
                  #
                </th>
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">Full name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Mobile</th>
                <th className="px-3 py-2.5">User UID</th>
                <th className="min-w-[200px] px-3 py-2.5">Payout address</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">Net</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">TXID</th>
                <th className="sticky right-0 z-[1] w-[136px] min-w-[132px] bg-[#1a1d21] px-3 py-2.5 pr-4 text-center shadow-[inset_1px_0_0_rgba(212,175,55,0.08)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-[#9898a8]">
                    Connecting…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-[#9898a8]">
                    No withdrawals match status, search, or date range.
                  </td>
                </tr>
              ) : (
                filtered.map((w, index) => {
                  const p = profiles.get(w.userId)
                  return (
                  <tr
                    key={w.id}
                    className="group border-b border-[rgba(212,175,55,0.08)] hover:bg-[rgba(212,175,55,0.03)]"
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-[1] w-12 min-w-[48px] bg-[#1a1d21] px-2 py-2.5 pl-4 text-center text-[11px] font-semibold text-[#9898a8]',
                        'shadow-[inset_-1px_0_0_rgba(212,175,55,0.06)] group-hover:bg-[rgba(212,175,55,0.03)]',
                      )}
                    >
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-[#9898a8]">{fmt(w.ms)}</td>
                    <td
                      className="max-w-[120px] truncate px-3 py-2.5 font-mono text-[11px] text-[#e4e4e7]"
                      title={p?.username || undefined}
                    >
                      {p?.username || '—'}
                    </td>
                    <td
                      className="max-w-[140px] truncate px-3 py-2.5 text-[11px] text-[#e4e4e7]"
                      title={p?.fullName || undefined}
                    >
                      {p?.fullName || '—'}
                    </td>
                    <td className="max-w-[160px] break-all px-3 py-2.5 text-[11px]">
                      {p?.email || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">{p?.phone || '—'}</td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-[10px] text-[#9898a8]" title={w.userId}>
                      {w.userId}
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5 align-top">
                      {w.address ? (
                        <span
                          className="block break-all font-mono text-[10px] leading-snug text-[#e4e4e7]"
                          title={w.address}
                        >
                          {w.address}
                        </span>
                      ) : (
                        <span className="text-[#6b6b7c]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-[#e4e4e7]">
                      {w.amountGross.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#9898a8]" title={`Fee ${w.fee.toFixed(2)}`}>
                      {w.amountNet.toFixed(2)}
                    </td>
                    <td className={cn('whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold capitalize', statusStyle(w.status))}>
                      {w.status}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-[10px] text-[#f5e6a8]">
                      {w.txId || '—'}
                    </td>
                    <td
                      className={cn(
                        'sticky right-0 z-[1] w-[136px] min-w-[132px] bg-[#1a1d21] px-3 py-2.5 pr-4 align-middle',
                        'shadow-[inset_1px_0_0_rgba(212,175,55,0.06)] group-hover:bg-[rgba(212,175,55,0.03)]',
                      )}
                    >
                      {actionCell(w)}
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Card className="border-[rgba(212,175,55,0.2)] bg-[#1a1d21]/80 p-4 text-[12px] text-[#9898a8]">
        <p className="m-0">
          Deploy updated <code className="text-[#f5e6a8]">adminWithdrawalUpdate</code> after pulling so{' '}
          <strong>Processing</strong> is accepted server-side.
        </p>
      </Card>
    </div>
  )
}
