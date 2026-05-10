import { doc, getDoc, setDoc } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

export function AdminSiteSettings() {
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [minDeposit, setMinDeposit] = useState('50')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const snap = await getDoc(doc(db, COLLECTIONS.siteSettings, 'config'))
      if (!snap.exists()) return
      const d = snap.data() as Record<string, unknown>
      setMaintenanceMode(Boolean(d.maintenanceMode))
      setMinDeposit(String(d.minDeposit ?? 50))
    })()
  }, [])

  const save = async () => {
    setBusy(true)
    try {
      await setDoc(
        doc(db, COLLECTIONS.siteSettings, 'config'),
        {
          maintenanceMode,
          minDeposit: Number(minDeposit),
          updatedAt: Date.now(),
        },
        { merge: true },
      )
      toast.success('Site settings saved')
    } catch {
      toast.error('Save failed — verify admin Firestore rules')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h1 className="font-display text-2xl text-zinc-100">Site Settings</h1>
      <Card className="max-w-lg space-y-4 p-6">
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="accent-red-600"
            checked={maintenanceMode}
            onChange={(e) => setMaintenanceMode(e.target.checked)}
          />
          Maintenance mode (public routes)
        </label>
        <div>
          <Label>Minimum deposit (USDT)</Label>
          <Input value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} />
        </div>
        <Button type="button" className="w-full" variant="danger" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save configuration'}
        </Button>
      </Card>
    </motion.div>
  )
}
