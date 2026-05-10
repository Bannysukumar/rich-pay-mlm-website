import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type Tk = {
  id: string
  userId: string
  title: string
  status: string
  priority?: string
  department?: string
  ms: number
}

export function AdminTicketsPage() {
  const [rows, setRows] = useState<Tk[]>([])
  const [sel, setSel] = useState<Tk | null>(null)
  const [reply, setReply] = useState('')
  const [nextStatus, setNextStatus] = useState('answered')

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.tickets), orderBy('createdAt', 'desc'), limit(200))
    return onSnapshot(
      q,
      (snap) => {
        const list: Tk[] = []
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>
          const ts = x.createdAt as { toMillis?: () => number } | undefined
          const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(x.createdAt ?? 0)
          list.push({
            id: d.id,
            userId: String(x.userId ?? ''),
            title: String(x.title ?? ''),
            status: String(x.status ?? 'open'),
            priority: x.priority != null ? String(x.priority) : undefined,
            department: x.department != null ? String(x.department) : undefined,
            ms,
          })
        })
        setRows(list)
      },
      () => toast.error('Ticket stream interrupted'),
    )
  }, [])

  const postReply = async () => {
    if (!sel || !reply.trim()) return
    try {
      await addDoc(collection(db, COLLECTIONS.ticketReplies), {
        ticketId: sel.id,
        message: reply.trim(),
        fromAdmin: true,
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, COLLECTIONS.tickets, sel.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      })
      await pushAuditLog('adminTicketReply', { ticketId: sel.id })
      toast.success('Reply logged')
      setReply('')
      setSel(null)
    } catch {
      toast.error('Unable to persist reply — check indexes')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_minmax(300px,0.95fr)]">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl text-zinc-100">Ticket Management</h1>
          <p className="text-sm text-zinc-500">Respond in-band; members subscribe to replies in realtime.</p>
        </div>
        <Card className="overflow-x-auto border-red-900/25 p-0">
          <table className="w-full text-xs">
            <thead className="bg-red-950/30 text-[10px] uppercase text-red-950/85">
              <tr>
                <th className="px-3 py-2 text-left text-zinc-500">Opened</th>
                <th className="px-3 py-2 text-left text-zinc-500">Member</th>
                <th className="px-3 py-2 text-left text-zinc-500">Subject</th>
                <th className="px-3 py-2 text-left text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className={`cursor-pointer border-b border-zinc-900 hover:bg-white/5 ${sel?.id === t.id ? 'bg-red-950/35' : ''}`}
                  onClick={() => {
                    setSel(t)
                    setNextStatus(t.status === 'closed' ? 'open' : 'answered')
                  }}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {new Date(t.ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="font-mono text-[10px] text-zinc-600">{t.userId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-zinc-200">{t.title}</td>
                  <td className="px-3 py-2 text-zinc-500">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="h-fit space-y-3 border-red-900/25 p-4">
        {sel ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.3em] text-red-800">Composer</p>
            <p className="font-mono text-[11px] text-zinc-500">{sel.id}</p>
            <div>
              <Label>Next workflow status</Label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value)}
                className="w-full rounded-lg border border-zinc-900 bg-[#09090b] px-3 py-2 text-xs text-zinc-100"
              >
                <option value="answered">Answered</option>
                <option value="pending">Needs member</option>
                <option value="closed">Closed</option>
                <option value="open">Re-open</option>
              </select>
            </div>
            <div>
              <Label>Administrative reply</Label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Compose update…"
                className="mt-2 min-h-[132px] w-full rounded-xl border border-zinc-900 bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none focus:border-red-800"
              />
            </div>
            <Button type="button" variant="danger" onClick={() => void postReply()} disabled={!reply.trim()}>
              Publish reply & status
            </Button>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Select a ticket queue item to collaborate.</p>
        )}
      </Card>
    </div>
  )
}
