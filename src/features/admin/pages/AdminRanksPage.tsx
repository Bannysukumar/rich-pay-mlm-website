import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type RankRow = {
  id: string
  name: string
  requiredTeamBusiness: number
  dailyReward: number
  rewardDurationDays: number
  iconUrl?: string
  active: boolean
}

export function AdminRanksPage() {
  const [rows, setRows] = useState<RankRow[]>([])
  const [draft, setDraft] = useState({
    name: 'Director',
    requiredTeamBusiness: 0,
    dailyReward: 0,
    rewardDurationDays: 30,
    iconUrl: '',
    active: true,
  })

  useEffect(() => {
    return onSnapshot(query(collection(db, COLLECTIONS.ranks), limit(200)), (snap) => {
      const next: RankRow[] = []
      snap.forEach((ds) => {
        const x = ds.data() as Record<string, unknown>
        next.push({
          id: ds.id,
          name: String(x.name ?? ''),
          requiredTeamBusiness: Number(x.requiredTeamBusiness ?? x.teamBiz ?? 0),
          dailyReward: Number(x.dailyReward ?? 0),
          rewardDurationDays: Number(x.rewardDurationDays ?? x.durationDays ?? 0),
          iconUrl: x.iconUrl != null ? String(x.iconUrl) : undefined,
          active: Boolean(x.active),
        })
      })
      next.sort((a, b) => a.requiredTeamBusiness - b.requiredTeamBusiness)
      setRows(next)
    })
  }, [])

  const addRank = async () => {
    try {
      await addDoc(collection(db, COLLECTIONS.ranks), {
        ...draft,
        updatedAt: serverTimestamp(),
      })
      await pushAuditLog('adminRankUpsert', { mode: 'add', draft })
      toast.success('Rank stored')
      setDraft((d) => ({ ...d, name: `${d.name}+` }))
    } catch {
      toast.error('Failed to persist rank metadata')
    }
  }

  const toggle = async (r: RankRow) => {
    await updateDoc(doc(db, COLLECTIONS.ranks, r.id), { active: !r.active, updatedAt: serverTimestamp() })
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove rank row?')) return
    await deleteDoc(doc(db, COLLECTIONS.ranks, id))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Rank Bonus Settings</h1>
        <p className="text-sm text-zinc-500">Defines progressive leadership rewards.</p>
      </div>

      <Card className="grid gap-3 border-red-900/25 p-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Rank name</Label>
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </div>
        <div>
          <Label>Required team business</Label>
          <Input
            type="number"
            value={draft.requiredTeamBusiness}
            onChange={(e) => setDraft((d) => ({ ...d, requiredTeamBusiness: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Daily reward (USDT)</Label>
          <Input type="number" value={draft.dailyReward} onChange={(e) => setDraft((d) => ({ ...d, dailyReward: Number(e.target.value) }))} />
        </div>
        <div>
          <Label>Reward duration (days)</Label>
          <Input
            type="number"
            value={draft.rewardDurationDays}
            onChange={(e) => setDraft((d) => ({ ...d, rewardDurationDays: Number(e.target.value) }))}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Icon / badge URL</Label>
          <Input value={draft.iconUrl} onChange={(e) => setDraft((d) => ({ ...d, iconUrl: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            className="accent-red-600"
            checked={draft.active}
            onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
          />
          Active
        </label>
      </Card>
      <Button type="button" variant="danger" onClick={() => void addRank()}>
        Save rank blueprint
      </Button>

      <Card className="overflow-x-auto border-red-900/25 p-0">
        <table className="w-full text-xs">
          <thead className="bg-red-950/30 text-[10px] uppercase text-red-950/85">
            <tr>
              <th className="px-3 py-2 text-left text-zinc-500">Rank</th>
              <th className="px-3 py-2 text-left text-zinc-500">Team biz</th>
              <th className="px-3 py-2 text-zinc-500">Daily</th>
              <th className="px-3 py-2 text-zinc-500">Dur</th>
              <th className="px-3 py-2 text-right text-zinc-500">⋯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-900">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">${r.requiredTeamBusiness}</td>
                <td className="px-3 py-2">${r.dailyReward}</td>
                <td className="px-3 py-2">{r.rewardDurationDays}d</td>
                <td className="space-x-1 px-3 py-2 text-right">
                  <Button type="button" variant="outline" className="text-[10px]" onClick={() => void toggle(r)}>
                    {r.active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button type="button" variant="outline" className="text-[10px]" onClick={() => void remove(r.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
