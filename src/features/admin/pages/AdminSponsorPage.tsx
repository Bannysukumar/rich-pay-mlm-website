import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminSponsorPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [pct, setPct] = useState('5')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setPct(String(Number(data.sponsorPercent ?? 5)))
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save({ sponsorPercent: Number(pct || 0) }, 'adminSponsorPercent', { bumpPlanVersion: true })
      toast.success('Direct sponsor incentive updated instantly on activations.')
    } catch {
      toast.error('Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Sponsor Bonus Settings</h1>
        <p className="text-sm text-zinc-500">Percentage of package volume routed to immediate sponsor&apos;s income wallet.</p>
      </div>
      <Card className="max-w-md space-y-4 border-red-900/25 p-6">
        <div>
          <Label>Direct bonus (%)</Label>
          <Input value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <Button type="button" variant="danger" disabled={busy || !ready} onClick={() => void persist()}>
          Save sponsor rules
        </Button>
      </Card>
    </motion.div>
  )
}
