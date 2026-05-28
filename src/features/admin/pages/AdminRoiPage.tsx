import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminRoiPage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [enabled, setEnabled] = useState(true)
  const [rankOn, setRankOn] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ready) return
    setEnabled(data.roiEnabled !== false)
    setRankOn(data.rankRewardsEnabled !== false)
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save(
        {
          roiEnabled: enabled,
          rankRewardsEnabled: rankOn,
        },
        'adminRoiSchedule',
        { bumpPlanVersion: true },
      )
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
          Daily ROI credits run at{' '}
          <strong className="text-zinc-300">12:00 AM IST</strong> (midnight{' '}
          <code className="text-zinc-400">Asia/Kolkata</code>) via{' '}
          <code className="text-zinc-400">processDailyRoi</code>. Changing the cron requires deploying Cloud Functions.
          Schedule holiday off-days under{' '}
          <Link to="/admin/roi-off-days" className="text-[#d4af37] hover:underline">
            ROI off / holidays
          </Link>
          .
        </p>
      </div>
      <Card className="space-y-4 border-red-900/25 p-6">
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="accent-red-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Daily ROI cron enabled (<code className="text-zinc-500">processDailyRoi</code>)
        </label>
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="accent-red-600" checked={rankOn} onChange={(e) => setRankOn(e.target.checked)} />
          Rank milestone payouts (<code className="text-zinc-500">processDailyRankRewards</code>)
        </label>
        <Button type="button" variant="danger" disabled={busy || !ready} onClick={() => void persist()}>
          Save ROI cadence
        </Button>
      </Card>
    </motion.div>
  )
}
