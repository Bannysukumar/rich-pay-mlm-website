import { collection, documentId, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { adminFinalizeDepositCallable } from '@/lib/api/adminCallables'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { DepositStatus } from '@/types/models'
import { cn } from '@/lib/utils/cn'

type Row = {
  id: string
  userId: string
  amount: number
  status: DepositStatus
  proofUrl: string | null
  ms: number
  walletCreditApplied: boolean
}

type ProfileLite = {
  username: string
  email: string
  phone: string
}

function extractProofUrl(x: Record<string, unknown>): string | null {
  const keys = ['proofUrl', 'proof', 'screenshotUrl', 'receiptUrl', 'attachmentUrl', 'imageUrl', 'txnProofUrl']
  for (const k of keys) {
    const v = x[k]
    if (typeof v === 'string' && v.trim().length > 0) {
      const s = v.trim()
      if (s.startsWith('http') || s.startsWith('blob:')) return s
    }
  }
  return null
}

function depositCreatedMs(data: Record<string, unknown>): number {
  const ts = data.createdAt as { toMillis?: () => number } | undefined
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
  return Number(data.createdAt ?? 0)
}

function paymentIdFromDocId(id: string): string {
  const alnum = id.replace(/[^a-zA-Z0-9]/g, '')
  return (alnum.slice(0, 13) || id.slice(0, 13)).toUpperCase()
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
          phone: String(x.phone ?? ''),
        })
      })
    } catch {
      toast.error('Could not load some user profiles for deposits')
    }
  }
  return map
}

function DepositApproveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide',
        'bg-[#dc2626] text-white hover:bg-[#ef4444]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60',
      )}
    >
      {label}
    </button>
  )
}

function DepositRejectBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-wide',
        'border-[rgba(212,175,55,0.45)] bg-[rgba(212,175,55,0.1)] text-[#f5e6a8]',
        'hover:border-[rgba(212,175,55,0.65)] hover:bg-[rgba(212,175,55,0.18)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]/70',
      )}
    >
      Reject
    </button>
  )
}

function ProofCell({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="max-w-[120px]">
        <span className="text-[11px] text-[#9898a8]">No proof</span>
        <p className="mt-0.5 text-[9px] leading-tight text-[#6b6b7c]">Member QR flow omits uploads today.</p>
      </div>
    )
  }
  const img = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)
  return (
    <div className="flex max-w-[140px] flex-col gap-1.5">
      {img ? (
        <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md ring-1 ring-[rgba(212,175,55,0.25)]">
          <img src={url} alt="Proof" className="h-14 w-full object-cover hover:opacity-90" loading="lazy" />
        </a>
      ) : null}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] font-semibold text-[#f5e6a8] underline decoration-[rgba(212,175,55,0.4)] underline-offset-2 hover:text-white"
      >
        Open proof
      </a>
    </div>
  )
}

export function AdminDepositsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | DepositStatus>('all')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')

  const refreshProfiles = useCallback(async (uids: string[]) => {
    if (uids.length === 0) return
    const m = await fetchUserProfiles(uids)
    setProfiles(m)
  }, [])

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.deposits), orderBy('createdAt', 'desc'), limit(250))
    return onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>
          next.push({
            id: d.id,
            userId: String(x.userId ?? ''),
            amount: Number(x.amount ?? 0),
            status: (String(x.status ?? 'pending') as DepositStatus) || 'pending',
            proofUrl: extractProofUrl(x),
            ms: depositCreatedMs(x),
            walletCreditApplied: x.walletCreditApplied === true,
          })
        })
        setRows(next)
        setLoading(false)
        void refreshProfiles(next.map((r) => r.userId))
      },
      () => {
        setLoading(false)
        toast.error('Could not subscribe to deposits stream')
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
      if (paymentIdFromDocId(r.id).toLowerCase().includes(qq)) return true
      return false
    })
  }, [filter, rows, search, profiles])

  const setStatus = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await adminFinalizeDepositCallable({
        depositId: id,
        decision,
        adminNote: note.trim() || undefined,
      })
      if (decision === 'approved' && res.credited > 0) {
        toast.success(`Approved — ${res.credited} USDT credited to deposit wallet`)
      } else if (decision === 'approved') {
        toast.success('Deposit confirmed (wallet already credited or no new credit)')
      } else {
        toast.success('Deposit rejected')
      }
      setNote('')
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Could not update deposit'
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

  const colSpan = 10

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Deposit Management</h1>
          <p className="text-sm text-[#9898a8]">
            Approve / reject runs the <code className="text-[#f5e6a8]">adminFinalizeDeposit</code> callable so the
            member&apos;s <code className="text-[#f5e6a8]">wallets.deposit</code> updates in the same transaction. If a
            row shows approved but &quot;Credit wallet&quot; still appears, use it once to backfill a missed credit.
            Deploy the latest functions and add the <code className="text-[#f5e6a8]">/api/call/adminFinalizeDeposit</code>{' '}
            hosting rewrite.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="admin-panel-sheet min-w-[min(100%,280px)] flex-1 space-y-2 p-3 sm:max-w-md">
            <Label>Search by email or username</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. user@mail.com or 4448551"
              autoComplete="off"
            />
            <p className="text-[10px] text-[#6b6b7c]">Also matches user UID or payment ID substring.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
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
      </div>

      <div className="admin-panel-sheet space-y-2 p-4">
        <Label>Optional note appended to approvals / rejections</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" />
      </div>

      <div className="admin-panel-sheet overflow-hidden p-0">
        <div className="max-w-[100vw] overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[12px] text-[#c4c4ce]">
            <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                <th className="px-3 py-2.5 pl-4">Created</th>
                <th className="px-3 py-2.5">Payment ID</th>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">User UID</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Mobile</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Proof</th>
                <th className="sticky right-0 z-[1] w-[148px] min-w-[140px] bg-[#1a1d21] px-3 py-2.5 pr-4 text-center shadow-[inset_1px_0_0_rgba(212,175,55,0.08)]">
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
                    No rows in filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const p = profiles.get(r.userId)
                  const pendingBg = 'bg-[#1a1d21]'
                  return (
                    <tr key={r.id} className="group border-b border-[rgba(212,175,55,0.08)] hover:bg-[rgba(212,175,55,0.03)]">
                      <td className="whitespace-nowrap px-3 py-2.5 pl-4 text-[11px] text-[#9898a8]">{fmt(r.ms)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-[#f5e6a8]">
                        {paymentIdFromDocId(r.id)}
                      </td>
                      <td className="max-w-[100px] truncate px-3 py-2.5 font-mono text-[11px] text-[#e4e4e7]">
                        {p?.username || '—'}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-[10px] text-[#9898a8]" title={r.userId}>
                        {r.userId || '—'}
                      </td>
                      <td className="max-w-[160px] break-all px-3 py-2.5 text-[11px]">{p?.email || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">{p?.phone || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-[#e4e4e7]">
                        {r.amount.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={cn(
                            'font-semibold',
                            r.status === 'approved' && 'text-[#4ade80]',
                            r.status === 'rejected' && 'text-[#f87171]',
                            r.status === 'pending' && 'text-[#f5e6a8]',
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <ProofCell url={r.proofUrl} />
                      </td>
                      <td
                        className={cn(
                          'sticky right-0 z-[1] w-[148px] min-w-[140px] px-3 py-2.5 pr-4 align-middle',
                          pendingBg,
                          'shadow-[inset_1px_0_0_rgba(212,175,55,0.06)] group-hover:bg-[rgba(212,175,55,0.03)]',
                        )}
                      >
                        <div className="flex flex-col items-stretch gap-1.5">
                          {r.status === 'pending' ? (
                            <>
                              <DepositApproveBtn label="Approve" onClick={() => void setStatus(r.id, 'approved')} />
                              <DepositRejectBtn onClick={() => void setStatus(r.id, 'rejected')} />
                            </>
                          ) : r.status === 'approved' && !r.walletCreditApplied ? (
                            <DepositApproveBtn
                              label="Credit wallet"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    'Use ONLY if this member’s deposit wallet was never credited for this deposit. If wallet was already credited (e.g. old automation), skipping avoids a double payment. Continue?',
                                  )
                                )
                                  return
                                void setStatus(r.id, 'approved')
                              }}
                            />
                          ) : (
                            <span className="text-center text-[10px] font-medium text-[#6b6b7c]">—</span>
                          )}
                        </div>
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
          Proof links read from{' '}
          <code className="text-[#f5e6a8]">proofUrl</code> and fallback field names when present. If every row shows
          “No proof”, members are not attaching files yet—you can extend the deposit form to upload to Storage and set{' '}
          <code className="text-[#f5e6a8]">proofUrl</code>.
        </p>
      </Card>
    </div>
  )
}
