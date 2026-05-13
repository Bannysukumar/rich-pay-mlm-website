import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import {
  adminAdjustMemberBalancesCallable,
  type AdminAdjustMemberBalanceField,
} from '@/lib/api/adminCallables'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type ResolvedMember = { uid: string; username: string; email: string }

type BalanceSnapshot = {
  wallets: { deposit: number; activation: number; cash: number }
  nonWorkingIncomeBalance: number
  workingIncomeBalance: number
  totalWorkingIncome: number
  sponsorBonusTotal: number
  dailyProfitsTotal: number
  teamLevelCommissionTotal: number
  rankCommissionTotal: number
}

function mapBalances(d: Record<string, unknown>): BalanceSnapshot {
  const w = (d.wallets as Record<string, unknown> | undefined) || {}
  return {
    wallets: {
      deposit: Number(w.deposit ?? 0),
      activation: Number(w.activation ?? 0),
      cash: Number(w.cash ?? 0),
    },
    nonWorkingIncomeBalance: Number(d.nonWorkingIncomeBalance ?? 0),
    workingIncomeBalance: Number(d.workingIncomeBalance ?? 0),
    totalWorkingIncome: Number((d.userTotals as Record<string, unknown> | undefined)?.totalWorkingIncome ?? 0),
    sponsorBonusTotal: Number(d.sponsorBonusTotal ?? 0),
    dailyProfitsTotal: Number(d.dailyProfitsTotal ?? 0),
    teamLevelCommissionTotal: Number(d.teamLevelCommissionTotal ?? 0),
    rankCommissionTotal: Number(d.rankCommissionTotal ?? 0),
  }
}

export function AdminMemberBalanceAdjustPage() {
  const [lookup, setLookup] = useState('')
  const [resolved, setResolved] = useState<ResolvedMember | null>(null)
  const [balances, setBalances] = useState<BalanceSnapshot | null>(null)
  const [resolving, setResolving] = useState(false)

  const resolveMember = useCallback(async () => {
    const raw = lookup.trim()
    if (!raw) {
      toast.error('Enter a member UserID or Auth UID')
      return
    }
    setResolving(true)
    try {
      const key = raw.toLowerCase()
      const mapSnap = await getDoc(doc(db, COLLECTIONS.usersByUsername, key))
      if (mapSnap.exists()) {
        const uid = String(mapSnap.data()?.uid ?? '').trim()
        if (!uid) {
          toast.error('Username map has no uid')
          setResolved(null)
          return
        }
        const uSnap = await getDoc(doc(db, COLLECTIONS.users, uid))
        const username = uSnap.exists() ? String(uSnap.data()?.username ?? key) : key
        const email = uSnap.exists() ? String(uSnap.data()?.email ?? '') : ''
        setResolved({ uid, username, email })
        toast.success('Member loaded')
        return
      }
      const uSnap = await getDoc(doc(db, COLLECTIONS.users, raw))
      if (uSnap.exists()) {
        const username = String(uSnap.data()?.username ?? raw)
        const email = String(uSnap.data()?.email ?? '')
        setResolved({ uid: raw, username, email })
        toast.success('Member loaded')
        return
      }
      toast.error('No member found for that UserID or UID')
      setResolved(null)
    } catch {
      toast.error('Lookup failed')
      setResolved(null)
    } finally {
      setResolving(false)
    }
  }, [lookup])

  useEffect(() => {
    if (!resolved) {
      setBalances(null)
      return
    }
    const ref = doc(db, COLLECTIONS.users, resolved.uid)
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setBalances(null)
          return
        }
        setBalances(mapBalances(snap.data() as Record<string, unknown>))
      },
      () => {
        toast.error('Could not subscribe to member profile')
      },
    )
  }, [resolved?.uid])

  const walletDelta = async (e: FormEvent) => {
    e.preventDefault()
    if (!resolved) return
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    const field = String(fd.get('wallet') || '') as AdminAdjustMemberBalanceField
    const raw = Number(fd.get('delta') || 0)
    const allowed: AdminAdjustMemberBalanceField[] = [
      'wallet_deposit',
      'wallet_activation',
      'wallet_cash',
      'nonWorkingIncomeBalance',
      'workingIncomeBalance',
      'userTotals_totalWorkingIncome',
      'sponsorBonusTotal',
      'dailyProfitsTotal',
      'teamLevelCommissionTotal',
      'rankCommissionTotal',
    ]
    if (!allowed.includes(field) || raw === 0) {
      toast.error('Pick a balance field and a non-zero delta')
      return
    }
    try {
      await adminAdjustMemberBalancesCallable({ userId: resolved.uid, field, delta: raw })
      await pushAuditLog('adminWalletAdjust', { userId: resolved.uid, field, delta: raw })
      toast.success('Balance adjusted')
      ;(e.currentTarget as HTMLFormElement).reset()
    } catch {
      toast.error('Could not adjust balance (check permissions, delta, and deploy functions)')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Member balance adjustment</h1>
        <p className="text-sm text-[#9898a8]">
          Load a member by referral <span className="font-mono text-[#f5e6a8]">UserID</span> or Firebase{' '}
          <span className="font-mono text-[#f5e6a8]">UID</span>, then apply signed deltas via{' '}
          <code className="text-[#a8a8b8]">adminAdjustMemberBalances</code>.
        </p>
      </div>

      <div className="admin-panel-sheet max-w-xl space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label>Member UserID or Auth UID</Label>
            <Input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="e.g. 4545719 or Auth uid…"
              disabled={resolving}
            />
          </div>
          <Button type="button" variant="danger" disabled={resolving} onClick={() => void resolveMember()}>
            {resolving ? 'Loading…' : 'Load member'}
          </Button>
        </div>

        {resolved ? (
          <div className="rounded-md border border-[rgba(212,175,55,0.15)] bg-[rgba(0,0,0,0.15)] px-3 py-2 text-[12px] text-[#c4c4ce]">
            <span className="font-mono font-semibold text-[#f5e6a8]">{resolved.username}</span>
            <span className="mx-2 text-[#6b6b7c]">·</span>
            <span className="font-mono text-[10px] text-[#9898a8]" title={resolved.uid}>
              UID {resolved.uid.length > 18 ? `${resolved.uid.slice(0, 18)}…` : resolved.uid}
            </span>
            {resolved.email ? (
              <>
                <span className="mx-2 text-[#6b6b7c]">·</span>
                <span className="break-all text-[11px]">{resolved.email}</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {resolved && balances ? (
        <div className="admin-panel-sheet max-w-xl space-y-4 p-5">
          <div className="text-[11px] text-[#9898a8]">
            <p className="mb-1 font-semibold text-[#c4c4ce]">Wallets</p>
            <div>Deposit: ${balances.wallets.deposit.toFixed(2)}</div>
            <div>Activation: ${balances.wallets.activation.toFixed(2)}</div>
            <div>Cash: ${balances.wallets.cash.toFixed(2)}</div>
            <p className="mb-1 mt-3 font-semibold text-[#c4c4ce]">Income / caps</p>
            <div>Non-working income bal.: ${balances.nonWorkingIncomeBalance.toFixed(2)}</div>
            <div>Working income bal.: ${balances.workingIncomeBalance.toFixed(2)}</div>
            <div>Total working income (cap track): ${balances.totalWorkingIncome.toFixed(2)}</div>
            <p className="mb-1 mt-3 font-semibold text-[#c4c4ce]">Cumulative totals (ledger)</p>
            <div>Sponsor bonus total: ${balances.sponsorBonusTotal.toFixed(2)}</div>
            <div>Daily profits total: ${balances.dailyProfitsTotal.toFixed(2)}</div>
            <div>Team level total: ${balances.teamLevelCommissionTotal.toFixed(2)}</div>
            <div>Rank commission total: ${balances.rankCommissionTotal.toFixed(2)}</div>
          </div>

          <form className="grid gap-2 border-t border-zinc-900 pt-4 text-xs" onSubmit={(ev) => void walletDelta(ev)}>
            <Label>Balance adjustment (+/- USDT)</Label>
            <select
              name="wallet"
              className="rounded-md border border-zinc-800 bg-[#09090b] px-2 py-1.5 text-zinc-200"
            >
              <option value="wallet_deposit">Deposit wallet</option>
              <option value="wallet_activation">Activation wallet</option>
              <option value="wallet_cash">Cash wallet</option>
              <option value="nonWorkingIncomeBalance">Non-working income balance</option>
              <option value="workingIncomeBalance">Working income balance</option>
              <option value="userTotals_totalWorkingIncome">Total working income (3× cap counter)</option>
              <option value="sponsorBonusTotal">Sponsor bonus (cumulative)</option>
              <option value="dailyProfitsTotal">Daily profits (cumulative)</option>
              <option value="teamLevelCommissionTotal">Team level bonus (cumulative)</option>
              <option value="rankCommissionTotal">Rank bonus (cumulative)</option>
            </select>
            <Input name="delta" type="number" step="0.01" placeholder="e.g. 25 or -10" />
            <Button type="submit" variant="outline">
              Apply delta
            </Button>
            <p className="text-[10px] text-[#6b6b7c]">
              Server-validated; cannot drive a balance negative. Deploy{' '}
              <code className="text-[#a8a8b8]">adminAdjustMemberBalances</code> for production. No automatic member
              notification.
            </p>
          </form>
        </div>
      ) : resolved ? (
        <p className="text-sm text-[#9898a8]">Loading balances…</p>
      ) : null}
    </div>
  )
}
