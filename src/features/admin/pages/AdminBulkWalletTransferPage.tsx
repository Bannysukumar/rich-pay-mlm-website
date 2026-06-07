import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import {
  adminBulkWalletTransferCallable,
  adminMemberWalletTransferCallable,
  adminPreviewBulkWalletTransferCallable,
  type BulkWalletKey,
} from '@/lib/api/adminCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

const WALLET_OPTIONS: { value: BulkWalletKey; label: string }[] = [
  { value: 'deposit', label: 'Deposit wallet' },
  { value: 'activation', label: 'Activation wallet' },
  { value: 'cash', label: 'Cash wallet' },
]

const BULK_CONFIRM_PHRASE = 'TRANSFER ALL'

type ResolvedMember = { uid: string; username: string; fullName: string; email: string }

type WalletBalances = { deposit: number; activation: number; cash: number }

function walletLabel(key: BulkWalletKey): string {
  return WALLET_OPTIONS.find((o) => o.value === key)?.label ?? key
}

function readWalletBalances(data: Record<string, unknown>): WalletBalances {
  const w = (data.wallets as Record<string, unknown> | undefined) || {}
  const leaf = (key: BulkWalletKey) => {
    const nest = Number(w[key] ?? 0)
    const shadow = Number(data[`wallets.${key}`] ?? 0)
    return nest + shadow
  }
  return { deposit: leaf('deposit'), activation: leaf('activation'), cash: leaf('cash') }
}

const selectClass =
  'mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100'

export function AdminBulkWalletTransferPage() {
  const { data, ready } = useLiveSiteConfig()
  const maintenanceOn = Boolean(data.maintenanceMode)

  // —— Single member ——
  const [memberLookup, setMemberLookup] = useState('')
  const [member, setMember] = useState<ResolvedMember | null>(null)
  const [memberBalances, setMemberBalances] = useState<WalletBalances | null>(null)
  const [memberResolving, setMemberResolving] = useState(false)
  const [memberFrom, setMemberFrom] = useState<BulkWalletKey>('cash')
  const [memberTo, setMemberTo] = useState<BulkWalletKey>('activation')
  const [memberBusy, setMemberBusy] = useState(false)

  const memberWalletsDifferent = memberFrom !== memberTo
  const memberSourceAmount = memberBalances?.[memberFrom] ?? 0

  const resolveMember = useCallback(async () => {
    const raw = memberLookup.trim()
    if (!raw) {
      toast.error('Enter a member UserID or Auth UID')
      return
    }
    setMemberResolving(true)
    try {
      const key = raw.toLowerCase()
      const mapSnap = await getDoc(doc(db, COLLECTIONS.usersByUsername, key))
      if (mapSnap.exists()) {
        const uid = String(mapSnap.data()?.uid ?? '').trim()
        if (!uid) {
          toast.error('Username map has no uid')
          setMember(null)
          return
        }
        const uSnap = await getDoc(doc(db, COLLECTIONS.users, uid))
        if (!uSnap.exists()) {
          toast.error('Member profile not found')
          setMember(null)
          return
        }
        const d = uSnap.data() as Record<string, unknown>
        setMember({
          uid,
          username: String(d.username ?? key),
          fullName: String(d.fullName ?? '').trim(),
          email: String(d.email ?? '').trim(),
        })
        setMemberBalances(readWalletBalances(d))
        toast.success('Member loaded')
        return
      }
      const uSnap = await getDoc(doc(db, COLLECTIONS.users, raw))
      if (uSnap.exists()) {
        const d = uSnap.data() as Record<string, unknown>
        setMember({
          uid: raw,
          username: String(d.username ?? raw),
          fullName: String(d.fullName ?? '').trim(),
          email: String(d.email ?? '').trim(),
        })
        setMemberBalances(readWalletBalances(d))
        toast.success('Member loaded')
        return
      }
      toast.error('No member found for that UserID or UID')
      setMember(null)
    } catch {
      toast.error('Lookup failed')
      setMember(null)
    } finally {
      setMemberResolving(false)
    }
  }, [memberLookup])

  useEffect(() => {
    if (!member) {
      setMemberBalances(null)
      return
    }
    const ref = doc(db, COLLECTIONS.users, member.uid)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMemberBalances(null)
        return
      }
      setMemberBalances(readWalletBalances(snap.data() as Record<string, unknown>))
    })
  }, [member?.uid])

  const runMemberTransfer = async () => {
    if (!member) {
      toast.error('Load a member first')
      return
    }
    if (!memberWalletsDifferent) {
      toast.error('Choose two different wallets')
      return
    }
    if (memberSourceAmount <= 0) {
      toast.error('No balance in the source wallet')
      return
    }
    if (
      !window.confirm(
        `Move ${memberSourceAmount} USDT from ${walletLabel(memberFrom)} to ${walletLabel(memberTo)} for ${member.username}?`,
      )
    ) {
      return
    }
    setMemberBusy(true)
    try {
      const res = await adminMemberWalletTransferCallable({
        userId: member.uid,
        fromWallet: memberFrom,
        toWallet: memberTo,
      })
      toast.success(`Transferred ${res.amountTransferred} USDT for ${member.username}`)
    } catch (err: unknown) {
      toast.error(getCallableErrorMessage(err) || 'Member transfer failed')
    } finally {
      setMemberBusy(false)
    }
  }

  // —— Bulk all members ——
  const [fromWallet, setFromWallet] = useState<BulkWalletKey>('cash')
  const [toWallet, setToWallet] = useState<BulkWalletKey>('activation')
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [executeBusy, setExecuteBusy] = useState(false)
  const [preview, setPreview] = useState<{
    totalUsers: number
    usersWithBalance: number
    totalAmount: number
  } | null>(null)

  const walletsDifferent = fromWallet !== toWallet
  const confirmOk = confirmPhrase.trim() === BULK_CONFIRM_PHRASE
  const canExecuteBulk = ready && maintenanceOn && walletsDifferent && confirmOk && preview !== null

  const bulkSummaryLine = useMemo(() => {
    if (!walletsDifferent) return 'Choose two different wallets.'
    return `Move all member ${walletLabel(fromWallet).toLowerCase()} balances → ${walletLabel(toWallet).toLowerCase()}.`
  }, [fromWallet, toWallet, walletsDifferent])

  const runPreview = async () => {
    if (!walletsDifferent) {
      toast.error('Source and destination wallet must be different')
      return
    }
    setPreviewBusy(true)
    try {
      const res = await adminPreviewBulkWalletTransferCallable({ fromWallet, toWallet })
      setPreview({
        totalUsers: res.totalUsers,
        usersWithBalance: res.usersWithBalance,
        totalAmount: res.totalAmount,
      })
      toast.success('Preview loaded')
    } catch (err: unknown) {
      toast.error(getCallableErrorMessage(err) || 'Preview failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  const runBulkTransfer = async () => {
    if (!maintenanceOn) {
      toast.error('Enable maintenance mode first')
      return
    }
    if (!canExecuteBulk) return
    if (
      !window.confirm(
        `This will move ${preview?.totalAmount ?? 0} USDT from ${walletLabel(fromWallet)} to ${walletLabel(toWallet)} for ${preview?.usersWithBalance ?? 0} members. Continue?`,
      )
    ) {
      return
    }
    setExecuteBusy(true)
    try {
      const res = await adminBulkWalletTransferCallable({
        fromWallet,
        toWallet,
        confirmPhrase: confirmPhrase.trim(),
      })
      setPreview({
        totalUsers: res.totalUsers,
        usersWithBalance: res.usersWithBalance,
        totalAmount: res.totalAmount,
      })
      toast.success(
        `Transferred ${res.totalAmount} USDT for ${res.usersWithBalance} members. Source wallets zeroed.`,
      )
      setConfirmPhrase('')
    } catch (err: unknown) {
      toast.error(getCallableErrorMessage(err) || 'Bulk transfer failed')
    } finally {
      setExecuteBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Wallet transfer</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Move balances between Deposit, Activation, and Cash wallets. Single-member transfers work anytime. Moving{' '}
          <strong className="text-zinc-300">all users at once</strong> requires maintenance mode.
        </p>
      </div>

      <Card className="max-w-2xl space-y-5 border-emerald-900/25 p-6">
        <div>
          <h2 className="text-lg font-medium text-zinc-100">Single member transfer</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Move one member&apos;s full source-wallet balance to another wallet.{' '}
            <strong className="text-zinc-300">No maintenance mode required.</strong>
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1"
            placeholder="UserID or Auth UID"
            value={memberLookup}
            onChange={(e) => setMemberLookup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void resolveMember()
            }}
          />
          <Button type="button" variant="outline" disabled={memberResolving} onClick={() => void resolveMember()}>
            {memberResolving ? 'Loading…' : 'Load member'}
          </Button>
        </div>

        {member ? (
          <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">
              {member.fullName || member.username} · UserID {member.username}
            </p>
            <p className="text-xs text-zinc-500">{member.email || member.uid}</p>
            {memberBalances ? (
              <p className="mt-2 text-xs">
                Deposit: {memberBalances.deposit} · Activation: {memberBalances.activation} · Cash:{' '}
                {memberBalances.cash}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>From wallet</Label>
            <select className={selectClass} value={memberFrom} onChange={(e) => setMemberFrom(e.target.value as BulkWalletKey)}>
              {WALLET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {memberBalances ? (
              <p className="mt-1 text-xs text-zinc-500">Available: {memberSourceAmount} USDT</p>
            ) : null}
          </div>
          <div>
            <Label>To wallet</Label>
            <select className={selectClass} value={memberTo} onChange={(e) => setMemberTo(e.target.value as BulkWalletKey)}>
              {WALLET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          disabled={!member || !memberWalletsDifferent || memberSourceAmount <= 0 || memberBusy}
          onClick={() => void runMemberTransfer()}
        >
          {memberBusy ? 'Transferring…' : 'Transfer member wallet'}
        </Button>

        <p className="text-xs text-zinc-500">
          Audited as <code className="text-zinc-400">adminMemberWalletTransfer</code>. Entire source balance is moved;
          source wallet is zeroed.
        </p>
      </Card>

      <Card
        className={`max-w-2xl space-y-3 border p-5 ${maintenanceOn ? 'border-emerald-900/40 bg-emerald-950/15' : 'border-red-900/40 bg-red-950/15'}`}
      >
        <h2 className="text-lg font-medium text-zinc-100">Bulk transfer (all members)</h2>
        <p className="text-sm text-zinc-300">
          Maintenance mode:{' '}
          <strong className={maintenanceOn ? 'text-emerald-300' : 'text-red-300'}>
            {ready ? (maintenanceOn ? 'ON — bulk transfer allowed' : 'OFF — enable before bulk execute') : 'Loading…'}
          </strong>
        </p>
        {!maintenanceOn ? (
          <Link to="/admin/maintenance" className="text-xs text-red-300 hover:text-red-200">
            → Enable maintenance mode
          </Link>
        ) : null}
      </Card>

      <Card className="max-w-2xl space-y-5 border-red-900/25 p-6">
        <p className="text-sm text-zinc-400">{bulkSummaryLine}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>From wallet</Label>
            <select
              id="bulk-from-wallet"
              className={selectClass}
              value={fromWallet}
              onChange={(e) => {
                setFromWallet(e.target.value as BulkWalletKey)
                setPreview(null)
              }}
            >
              {WALLET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>To wallet</Label>
            <select
              id="bulk-to-wallet"
              className={selectClass}
              value={toWallet}
              onChange={(e) => {
                setToWallet(e.target.value as BulkWalletKey)
                setPreview(null)
              }}
            >
              {WALLET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button type="button" variant="outline" disabled={!walletsDifferent || previewBusy} onClick={() => void runPreview()}>
          {previewBusy ? 'Loading preview…' : 'Preview transfer totals'}
        </Button>

        {preview ? (
          <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            <p>Total members in system: {preview.totalUsers}</p>
            <p>Members with balance in source wallet: {preview.usersWithBalance}</p>
            <p className="font-medium text-zinc-100">Total amount to move: {preview.totalAmount} USDT</p>
          </div>
        ) : null}

        <div className="border-t border-zinc-800 pt-4">
          <Label>Confirmation (type {BULK_CONFIRM_PHRASE})</Label>
          <Input
            id="bulk-confirm"
            className="mt-1 font-mono"
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            placeholder={BULK_CONFIRM_PHRASE}
            autoComplete="off"
          />
        </div>

        <Button type="button" variant="danger" disabled={!canExecuteBulk || executeBusy} onClick={() => void runBulkTransfer()}>
          {executeBusy ? 'Transferring…' : 'Execute bulk transfer'}
        </Button>

        <p className="text-xs text-zinc-500">
          Audited as <code className="text-zinc-400">adminBulkWalletTransfer</code>. Run preview first. Members with
          zero in the source wallet are skipped.
        </p>
      </Card>
    </motion.div>
  )
}
