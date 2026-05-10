import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminMaintenancePage() {
  const { data, ready, save } = useLiveSiteConfig()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ready) setOn(Boolean(data.maintenanceMode))
  }, [data.maintenanceMode, ready])

  const persist = async () => {
    setBusy(true)
    try {
      await save({ maintenanceMode: on }, 'adminMaintenanceToggle')
      toast.success(on ? 'Maintenance enabled' : 'Maintenance disabled')
    } catch {
      toast.error('Could not toggle maintenance flag')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Maintenance Mode</h1>
        <p className="mt-1 max-w-xl text-sm text-zinc-500">
          Visitors on public routes immediately see the maintenance screen. Admins retain dashboard access via this
          session.
        </p>
      </div>
      <Card className="max-w-xl space-y-4 border-red-900/25 bg-red-950/15 p-6">
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="accent-red-600" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Enable maintenance splash for public routes
        </label>
        <Button type="button" variant="danger" disabled={!ready || busy} onClick={() => void persist()}>
          {busy ? 'Saving…' : 'Publish maintenance flag'}
        </Button>
        <Link to="/admin/site" className="block text-xs text-red-300 hover:text-red-200">
          → Full site branding & thresholds
        </Link>
      </Card>
    </motion.div>
  )
}
