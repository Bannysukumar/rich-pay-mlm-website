import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminTransferSettingsPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [peer, setPeer] = useState(true)
  const [income, setIncome] = useState(true)
  const [depositToActivation, setDepositToActivation] = useState(true)
  const [transferToAnyMember, setTransferToAnyMember] = useState(false)
  const [fee, setFee] = useState('0')
  const [minAmt, setMinAmt] = useState('0')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setPeer(data.allowPeerActivationTransfer !== false)
    setIncome(data.allowIncomeToActivation !== false)
    setDepositToActivation(data.depositToActivationConvertEnabled !== false)
    setTransferToAnyMember(data.allowActivationTransferToAnyUser === true)
    setFee(String(Number(data.internalTransferFeePercent ?? 0)))
    setMinAmt(String(Number(data.minActivationTransfer ?? 0)))
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save({
        allowPeerActivationTransfer: peer,
        allowIncomeToActivation: income,
        depositToActivationConvertEnabled: depositToActivation,
        allowActivationTransferToAnyUser: transferToAnyMember,
        internalTransferFeePercent: Number(fee),
        minActivationTransfer: Number(minAmt),
      })
      toast.success('Transfer settings saved.')
    } catch {
      toast.error('Persist failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Transfer Settings</h1>
        <p className="text-sm text-zinc-500">Feature flags for member transfers and conversions (activation peer transfer rules are enforced in `internalTransfer`).</p>
      </div>
      <Card className="max-w-xl space-y-4 border-red-900/25 p-6">
        <label className="flex items-center gap-3 text-xs text-zinc-300">
          <input type="checkbox" className="accent-red-600" checked={peer} onChange={(e) => setPeer(e.target.checked)} />
          Allow sponsor → referral activation transfers
        </label>
        <label className="flex items-center gap-3 text-xs text-zinc-300">
          <input type="checkbox" className="accent-red-600" checked={income} onChange={(e) => setIncome(e.target.checked)} />
          Allow income-wallet → activation migrations
        </label>
        <label className="flex items-center gap-3 text-xs text-zinc-300">
          <input
            type="checkbox"
            className="accent-red-600"
            checked={depositToActivation}
            onChange={(e) => setDepositToActivation(e.target.checked)}
          />
          Convert page: show Deposit → Activation (move deposit balance to activation wallet)
        </label>
        <label className="flex items-center gap-3 text-xs text-zinc-300">
          <input
            type="checkbox"
            className="accent-red-600"
            checked={transferToAnyMember}
            onChange={(e) => setTransferToAnyMember(e.target.checked)}
          />
          Activation transfers: allow any member UserID (off = direct referrals only; enforced in Cloud Functions)
        </label>
        <div>
          <Label>Symbolic transfer surcharge (%)</Label>
          <Input value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div>
          <Label>Minimum routed amount (informational)</Label>
          <Input value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
        </div>
        <Button type="button" variant="danger" disabled={busy || !ready} onClick={() => void persist()}>
          Persist flags
        </Button>
      </Card>
    </motion.div>
  )
}
