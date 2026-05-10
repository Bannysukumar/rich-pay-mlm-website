import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminRoiPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [enabled, setEnabled] = useState(true)
  const [hour, setHour] = useState('0')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setEnabled(data.roiEnabled !== false)
    setHour(String(Number(data.roiProcessHourUtc ?? 0)))
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save({
        roiEnabled: enabled,
        roiProcessHourUtc: Math.min(23, Math.max(0, Number(hour || 0))),
      })
      toast.success('ROI schedule stored')
    } catch {
      toast.error('Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">ROI Settings</h1>
        <p className="text-sm text-zinc-500">
          Scheduling metadata for the nightly Cloud Function cron. Computation still runs inside `processDailyRoi`.
        </p>
      </div>
      <Card className="space-y-4 border-red-900/25 p-6">
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="accent-red-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Accruals enabled globally
        </label>
        <div>
          <Label>Preferred processing hour (UTC)</Label>
          <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(e.target.value)} />
        </div>
        <Button type="button" variant="danger" disabled={busy || !ready} onClick={() => void persist()}>
          Save ROI cadence
        </Button>
      </Card>
    </motion.div>
  )
}
