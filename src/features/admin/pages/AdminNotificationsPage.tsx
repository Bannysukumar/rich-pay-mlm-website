import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { adminBroadcastNotificationCallable } from '@/lib/api/adminCallables'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

export function AdminNotificationsPage() {
  const [title, setTitle] = useState('Platform notice')
  const [body, setBody] = useState('')
  const [targetUid, setTargetUid] = useState('')
  const [busy, setBusy] = useState(false)

  const sendDirect = async () => {
    if (!targetUid.trim() || !body.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, COLLECTIONS.notifications), {
        userId: targetUid.trim(),
        title: title.trim(),
        body: body.trim(),
        read: false,
        createdAt: serverTimestamp(),
      })
      await pushAuditLog('adminNotifyUser', { userId: targetUid })
      toast.success('Notification issued')
      setBody('')
    } catch {
      toast.error('Enqueue failed — verify admin permissions')
    } finally {
      setBusy(false)
    }
  }

  const blast = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      const { sent } = await adminBroadcastNotificationCallable({ title: title.trim(), body: body.trim() })
      toast.success(`Broadcast routed to ${sent} accounts`)
      setBody('')
    } catch {
      toast.error('Broadcast aborted — callable timeout possible on large catalogs')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Notifications Center</h1>
        <p className="text-sm text-zinc-500">
          Direct payloads land instantly in each member inbox; broadcasts fan-out via audited Cloud Function.
        </p>
      </div>

      <Card className="grid gap-3 border-red-900/25 p-5 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1">
          <Label>Announcement title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label>Body markdown / plain</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[132px] w-full rounded-xl border border-zinc-900 bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none focus:border-red-900"
          />
        </div>
        <div>
          <Label>Target UID (precision)</Label>
          <Input value={targetUid} onChange={(e) => setTargetUid(e.target.value)} placeholder="firebase uid…" />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void sendDirect()}>
            Send to UID
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => void blast()}>
            Broadcast all members
          </Button>
        </div>
      </Card>
      <p className="text-[11px] text-zinc-600">
        Extremely large broadcasts can approach Cloud Functions execution quotas — stagger if necessary.
      </p>
    </motion.div>
  )
}
