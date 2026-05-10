import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { UserRole } from '@/types/models'
import { cn } from '@/lib/utils/cn'

type Row = {
  id: string
  username: string
  email: string
  fullName: string
  phone: string
  role: UserRole
  blocked: boolean
  sponsorUsername: string
  wallets: { deposit: number; activation: number; cash: number }
  createdAt: number
  /** Plaintext login password — only present if historically stored on the user doc (not default). */
  storedLoginPassword: string | null
}

function readStoredPassword(d: Record<string, unknown>): string | null {
  const keys = ['password', 'registrationPassword', 'loginPassword', 'memberPassword', 'plainPassword']
  for (const k of keys) {
    const v = d[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

function ManageActionButton({
  selected,
  onClick,
}: {
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide',
        'border-[rgba(212,175,55,0.45)] bg-[rgba(212,175,55,0.1)] text-[#f5e6a8]',
        'hover:border-[rgba(212,175,55,0.65)] hover:bg-[rgba(212,175,55,0.18)] hover:text-white',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]/70',
        selected && 'border-[rgba(212,175,55,0.75)] bg-[rgba(212,175,55,0.22)] ring-1 ring-[rgba(212,175,55,0.35)]',
      )}
    >
      Manage
    </button>
  )
}

function PasswordCell({ value }: { value: string | null }) {
  const [show, setShow] = useState(false)

  if (value === null || value === '') {
    return (
      <div className="max-w-[8.5rem]">
        <span className="text-[11px] text-[#9898a8]">Not in Firestore</span>
        <p className="mt-0.5 text-[9px] leading-tight text-[#6b6b7c]">Login password lives in Firebase Auth only.</p>
      </div>
    )
  }

  return (
    <div className="flex max-w-[10rem] flex-col gap-1">
      <code className="inline-block truncate rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-[#e4e4e7]">
        {show ? value : '•'.repeat(Math.min(value.length, 12))}
      </code>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="flex items-center gap-1 self-start text-[10px] font-semibold text-[#d4af37] hover:text-[#f5e6a8]"
      >
        {show ? (
          <>
            <EyeSlash weight="bold" className="size-3.5" /> Hide
          </>
        ) : (
          <>
            <Eye weight="bold" className="size-3.5" /> Show
          </>
        )}
      </button>
    </div>
  )
}

export function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Row | null>(null)

  useEffect(() => {
    const r = query(collection(db, COLLECTIONS.users), orderBy('createdAt', 'desc'), limit(250))
    return onSnapshot(
      r,
      (snap) => {
        const next: Row[] = []
        snap.forEach((docSnap) => {
          const d = docSnap.data() as Record<string, unknown>
          const w = (d.wallets as Row['wallets']) || { deposit: 0, activation: 0, cash: 0 }
          next.push({
            id: docSnap.id,
            username: String(d.username ?? ''),
            email: String(d.email ?? ''),
            fullName: String(d.fullName ?? ''),
            phone: String(d.phone ?? ''),
            role: (d.role as UserRole) || 'user',
            blocked: Boolean(d.blocked),
            sponsorUsername: d.sponsorUsername != null ? String(d.sponsorUsername) : '',
            wallets: {
              deposit: Number(w.deposit ?? 0),
              activation: Number(w.activation ?? 0),
              cash: Number(w.cash ?? 0),
            },
            createdAt: Number(d.createdAt ?? 0),
            storedLoginPassword: readStoredPassword(d),
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load users')
      },
    )
  }, [])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return rows
    return rows.filter(
      (x) =>
        x.username.toLowerCase().includes(qq) ||
        x.email.toLowerCase().includes(qq) ||
        x.phone.includes(qq) ||
        x.sponsorUsername.toLowerCase().includes(qq) ||
        x.id.toLowerCase().includes(qq),
    )
  }, [q, rows])

  const patchUser = async (patch: Record<string, unknown>) => {
    if (!sel) return
    try {
      await updateDoc(doc(db, COLLECTIONS.users, sel.id), { ...patch, updatedAt: Date.now() })
      await pushAuditLog('adminUserPatch', { userId: sel.id, patch })
      toast.success('User updated')
    } catch {
      toast.error('Update failed — check validation / permissions')
    }
  }

  const walletDelta = async (e: FormEvent) => {
    e.preventDefault()
    if (!sel) return
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    const wallet = String(fd.get('wallet') || '')
    const raw = Number(fd.get('delta') || 0)
    if (!['deposit', 'activation', 'cash'].includes(wallet) || raw === 0) {
      toast.error('Pick wallet and non-zero delta')
      return
    }
    try {
      await updateDoc(doc(db, COLLECTIONS.users, sel.id), {
        [`wallets.${wallet}`]: increment(raw),
        updatedAt: Date.now(),
      })
      await pushAuditLog('adminWalletAdjust', { userId: sel.id, wallet, delta: raw })
      toast.success('Balance adjusted')
    } catch {
      toast.error('Could not adjust balance')
    }
  }

  const tableColSpan = 8

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">User Management</h1>
          <p className="text-sm text-[#9898a8]">Live feed (latest 250). Search username, email, phone, sponsor ID, or Auth UID.</p>
        </div>
        <div className="admin-panel-sheet space-y-3 p-4">
          <Label>Search</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows…" />
        </div>

        <div className="admin-panel-sheet overflow-hidden p-0">
          <div className="max-w-[100vw] overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[12px] text-[#c4c4ce]">
              <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                  <th className="sticky left-0 z-[1] bg-[#1a1d21] px-3 py-2.5 pl-4 shadow-[inset_-1px_0_0_rgba(212,175,55,0.08)]">
                    User
                  </th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Referral ID</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Sponsor ID</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Password</th>
                  <th className="sticky right-0 z-[1] w-[108px] min-w-[104px] bg-[#1a1d21] px-3 py-2.5 pr-4 text-center shadow-[inset_1px_0_0_rgba(212,175,55,0.08)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-8 text-center text-[#9898a8]">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-8 text-center text-[#9898a8]">
                      No users match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr
                      key={u.id}
                      className={cn(
                        'group border-b border-[rgba(212,175,55,0.08)] transition-colors hover:bg-[rgba(212,175,55,0.03)]',
                        sel?.id === u.id && 'bg-[rgba(212,175,55,0.07)] hover:bg-[rgba(212,175,55,0.07)]',
                      )}
                    >
                      <td
                        className={cn(
                          'sticky left-0 z-[1] px-3 py-2.5 pl-4 shadow-[inset_-1px_0_0_rgba(212,175,55,0.06)]',
                          sel?.id === u.id
                            ? 'bg-[rgba(212,175,55,0.07)]'
                            : 'bg-[#1a1d21] group-hover:bg-[rgba(212,175,55,0.03)]',
                        )}
                      >
                        <div className="font-mono text-[13px] font-semibold text-[#e4e4e7]">{u.username || '—'}</div>
                        <div className="text-[10px] text-[#9898a8]">{u.fullName || '—'}</div>
                        <div className="mt-1 font-mono text-[9px] text-[#6b6b7c]" title={u.id}>
                          UID · {u.id.length > 12 ? `${u.id.slice(0, 12)}…` : u.id}
                        </div>
                      </td>
                      <td className="break-all px-3 py-2.5 align-top text-[11px] text-[#c4c4ce]">{u.email || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[12px] text-[#f5e6a8]">
                        {u.username || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">{u.phone || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[11px] text-[#9898a8]">
                        {u.sponsorUsername || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">
                        <span className={u.blocked ? 'text-[#f87171]' : 'text-[#c4c4ce]'}>
                          {u.blocked ? 'blocked' : u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <PasswordCell value={u.storedLoginPassword} />
                      </td>
                      <td
                        className={cn(
                          'sticky right-0 z-[1] w-[108px] min-w-[104px] px-3 py-2.5 pr-4 text-center align-middle shadow-[inset_1px_0_0_rgba(212,175,55,0.06)]',
                          sel?.id === u.id
                            ? 'bg-[rgba(212,175,55,0.07)]'
                            : 'bg-[#1a1d21] group-hover:bg-[rgba(212,175,55,0.03)]',
                        )}
                      >
                        <ManageActionButton selected={sel?.id === u.id} onClick={() => setSel(u)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Card className="h-fit space-y-4 border-[rgba(212,175,55,0.2)] bg-[#1a1d21] p-5">
        {!sel ? (
          <p className="text-sm text-[#9898a8]">Select <span className="font-semibold text-[#f5e6a8]">Manage</span> on a row to edit profile, role, or wallets.</p>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">Selected</p>
              <p className="font-mono text-lg text-[#e4e4e7]">{sel.username}</p>
              <p className="text-xs text-[#9898a8]">{sel.email}</p>
              <p className="mt-1 font-mono text-[10px] text-[#6b6b7c]">Referral ID: {sel.username}</p>
              {sel.storedLoginPassword ? (
                <p className="mt-2 text-[10px] text-[#6b6b7c]">
                  Stored password flag on Firestore doc — rotate via Firebase Auth if needed.
                </p>
              ) : null}
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                void patchUser({
                  fullName: String(fd.get('fullName') || '').trim(),
                  phone: String(fd.get('phone') || '').trim(),
                  blocked: fd.get('blocked') === 'on',
                  role: String(fd.get('role') || 'user'),
                })
              }}
            >
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input name="fullName" defaultValue={sel.fullName} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input name="phone" defaultValue={sel.phone} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="blocked" defaultChecked={sel.blocked} className="accent-red-600" />
                <span className="text-xs text-[#9898a8]">Block account login surfaces</span>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select
                  name="role"
                  defaultValue={sel.role}
                  className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs text-zinc-200"
                >
                  <option value="user">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button type="submit" variant="danger">
                Save profile
              </Button>
            </form>

            <div className="border-t border-zinc-900 pt-4 text-[11px] text-[#9898a8]">
              <div>Deposit: ${sel.wallets.deposit.toFixed(2)}</div>
              <div>Activation: ${sel.wallets.activation.toFixed(2)}</div>
              <div>Cash: ${sel.wallets.cash.toFixed(2)}</div>
            </div>

            <form className="grid gap-2 border-t border-zinc-900 pt-4 text-xs" onSubmit={walletDelta}>
              <Label>Ledger adjustment (+/- USDT)</Label>
              <select
                name="wallet"
                className="rounded-md border border-zinc-800 bg-[#09090b] px-2 py-1.5 text-zinc-200"
              >
                <option value="deposit">Deposit wallet</option>
                <option value="activation">Activation wallet</option>
                <option value="cash">Cash wallet</option>
              </select>
              <Input name="delta" type="number" step="0.01" placeholder="e.g. 25 or -10" />
              <Button type="submit" variant="outline">
                Apply delta
              </Button>
              <p className="text-[10px] text-[#6b6b7c]">Creates no automatic notification — follow up manually if needed.</p>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
