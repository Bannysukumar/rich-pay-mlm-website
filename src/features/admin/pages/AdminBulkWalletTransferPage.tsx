import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'
import {
  adminBulkWalletTransferCallable,
  adminPreviewBulkWalletTransferCallable,
  type BulkWalletKey,
} from '@/lib/api/adminCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'

const WALLET_OPTIONS: { value: BulkWalletKey; label: string }[] = [
  { value: 'deposit', label: 'Deposit wallet' },
  { value: 'activation', label: 'Activation wallet' },
  { value: 'cash', label: 'Cash wallet' },
]

const CONFIRM_PHRASE = 'TRANSFER ALL'

function walletLabel(key: BulkWalletKey): string {
  return WALLET_OPTIONS.find((o) => o.value === key)?.label ?? key
}

export function AdminBulkWalletTransferPage() {
  const { data, ready } = useLiveSiteConfig()
  const maintenanceOn = Boolean(data.maintenanceMode)

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
  const confirmOk = confirmPhrase.trim() === CONFIRM_PHRASE
  const canExecute = ready && maintenanceOn && walletsDifferent && confirmOk && preview !== null

  const summaryLine = useMemo(() => {
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

  const runTransfer = async () => {
    if (!maintenanceOn) {
      toast.error('Enable maintenance mode first')
      return
    }
    if (!canExecute) return
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Bulk wallet transfer</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Move <strong className="text-zinc-300">every member&apos;s</strong> balance from one wallet type to another
          (for example, all Cash → Activation). This only runs while{' '}
          <strong className="text-zinc-300">maintenance mode</strong> is on so members cannot trade or withdraw during
          the migration.
        </p>
      </div>

      <Card
        className={`max-w-2xl space-y-3 border p-5 ${maintenanceOn ? 'border-emerald-900/40 bg-emerald-950/15' : 'border-red-900/40 bg-red-950/15'}`}
      >
        <p className="text-sm text-zinc-300">
          Maintenance mode:{' '}
          <strong className={maintenanceOn ? 'text-emerald-300' : 'text-red-300'}>
            {ready ? (maintenanceOn ? 'ON — transfers allowed' : 'OFF — enable before executing') : 'Loading…'}
          </strong>
        </p>
        {!maintenanceOn ? (
          <Link to="/admin/maintenance" className="text-xs text-red-300 hover:text-red-200">
            → Enable maintenance mode
          </Link>
        ) : null}
      </Card>

      <Card className="max-w-2xl space-y-5 border-red-900/25 p-6">
        <p className="text-sm text-zinc-400">{summaryLine}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>From wallet</Label>
            <select
              id="bulk-from-wallet"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
          <Label>Confirmation (type {CONFIRM_PHRASE})</Label>
          <Input
            id="bulk-confirm"
            className="mt-1 font-mono"
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
          />
        </div>

        <Button type="button" variant="danger" disabled={!canExecute || executeBusy} onClick={() => void runTransfer()}>
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
