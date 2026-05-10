import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type Row = {
  id: string
  actorUid: string
  action: string
  ms: number
  detailPreview: string
}

export function AdminAuditPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    const r = query(collection(db, COLLECTIONS.auditLogs), orderBy('createdAt', 'desc'), limit(400))
    return onSnapshot(
      r,
      (snap) => {
        const next: Row[] = []
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>
          const ts = x.createdAt as { toMillis?: () => number } | undefined
          const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(x.createdAt ?? 0)
          next.push({
            id: d.id,
            actorUid: String(x.actorUid ?? ''),
            action: String(x.action ?? ''),
            ms,
            detailPreview: JSON.stringify(x.detail ?? {}).slice(0, 160),
          })
        })
        setRows(next)
      },
      () => toast.error('Audit stream blocked — indexes may deploy shortly'),
    )
  }, [])

  const filt = rows.filter(
    (r) =>
      !q.trim() ||
      r.action.toLowerCase().includes(q.toLowerCase()) ||
      r.actorUid.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Audit Trail</h1>
        <p className="text-sm text-zinc-500">
          Mirrors dual-logging from Firebase Functions (`audit`) plus privileged client confirmations.
        </p>
      </div>
      <Card className="space-y-2 border-red-900/25 p-4 md:max-w-md">
        <Label>Substring filter</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} />
      </Card>
      <Card className="overflow-x-auto border-red-900/25 p-0">
        <table className="w-full text-[11px]">
          <thead className="bg-red-950/30 text-[10px] uppercase text-red-950/85">
            <tr>
              <th className="px-3 py-2 text-left text-zinc-500">Time</th>
              <th className="px-3 py-2 text-left text-zinc-500">Actor</th>
              <th className="px-3 py-2 text-left text-zinc-500">Signal</th>
              <th className="px-3 py-2 text-left text-zinc-500">Payload</th>
            </tr>
          </thead>
          <tbody>
            {filt.map((r) => (
              <tr key={r.id} className="border-b border-zinc-900">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                  {new Date(r.ms).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">{r.actorUid.slice(0, 8)}…</td>
                <td className="px-3 py-2 text-red-900/95">{r.action}</td>
                <td className="max-w-[320px] truncate px-3 py-2 text-zinc-500">{r.detailPreview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </motion.div>
  )
}
