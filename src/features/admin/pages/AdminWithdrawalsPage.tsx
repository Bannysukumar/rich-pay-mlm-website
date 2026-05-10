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
import { Input, Label } from '@/components/ui/Input'
import { adminWithdrawalUpdateCallable } from '@/lib/api/adminCallables'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { WithdrawStatus } from '@/types/models'
import { cn } from '@/lib/utils/cn'

type Row = {
  id: string
  userId: string
  amountGross: number
  fee: number
  amountNet: number
  status: WithdrawStatus
  txId?: string
  ms: number
}

type ProfileLite = {
  username: string
  email: string
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
          email: String(x.email ?? ''),
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
    if (!qq) return byStatus
    return byStatus.filter((r) => {
      const p = profiles.get(r.userId)
      const username = (p?.username ?? '').toLowerCase()
      const email = (p?.email ?? '').toLowerCase()
      if (username.includes(qq) || email.includes(qq)) return true
      if (r.userId.toLowerCase().includes(qq)) return true
      if (r.id.toLowerCase().includes(qq)) return true
      return false
    })
  }, [filter, rows, search, profiles])

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

  const colSpan = 9

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
      <div>
        <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Withdrawal Management</h1>
        <p className="text-sm text-[#9898a8]">
          Rejecting pending or processing requests refunds the member automatically. Use <strong>Processing</strong> when
          payout work has started. Mark <strong>Paid</strong> with a blockchain TX hash.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="admin-panel-sheet min-w-[min(100%,280px)] flex-1 space-y-2 p-3 sm:max-w-md">
          <Label>Search by email or username</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. user@mail.com or 4448551"
            autoComplete="off"
          />
          <p className="text-[10px] text-[#6b6b7c]">Also matches user UID or withdrawal document id.</p>
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

      <div className="admin-panel-sheet space-y-2 p-4">
        <Label>Blockchain TX hash (required for Mark paid)</Label>
        <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x… / explorer hash" />
      </div>

      <div className="admin-panel-sheet overflow-hidden p-0">
        <div className="max-w-[100vw] overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12px] text-[#c4c4ce]">
            <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                <th className="px-3 py-2.5 pl-4">Submitted</th>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">User UID</th>
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
                    No withdrawals in scope.
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr
                    key={w.id}
                    className="group border-b border-[rgba(212,175,55,0.08)] hover:bg-[rgba(212,175,55,0.03)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 pl-4 text-[11px] text-[#9898a8]">{fmt(w.ms)}</td>
                    <td className="max-w-[100px] truncate px-3 py-2.5 font-mono text-[11px] text-[#e4e4e7]">
                      {profiles.get(w.userId)?.username || '—'}
                    </td>
                    <td className="max-w-[160px] break-all px-3 py-2.5 text-[11px]">
                      {profiles.get(w.userId)?.email || '—'}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-[10px] text-[#9898a8]" title={w.userId}>
                      {w.userId}
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
                ))
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
