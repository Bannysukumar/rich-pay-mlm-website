import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminWalletSettingsPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [minW, setMinW] = useState('25')
  const [fee, setFee] = useState('10')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setMinW(String(Number(data.minWithdrawal ?? 25)))
    setFee(String(Number(data.withdrawFeePercent ?? 10)))
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save({
        minWithdrawal: Number(minW),
        withdrawFeePercent: Number(fee),
      })
      toast.success('Wallet limits broadcast to smart contracts + UI')
    } catch {
      toast.error('Persist failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Wallet Settings</h1>
        <p className="text-sm text-zinc-500">Controls withdrawal guardrails surfaced on the member dashboards.</p>
      </div>
      <Card className="grid max-w-md gap-4 border-red-900/25 p-6">
        <div>
          <Label>Minimum withdrawal (USDT)</Label>
          <Input value={minW} onChange={(e) => setMinW(e.target.value)} />
        </div>
        <div>
          <Label>Withdrawal convenience fee (%)</Label>
          <Input value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <Button type="button" variant="danger" disabled={busy || !ready} onClick={() => void persist()}>
          Save treasury settings
        </Button>
      </Card>
    </motion.div>
  )
}
