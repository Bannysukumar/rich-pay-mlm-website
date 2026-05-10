import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { bumpPlanSettingsVersion } from '@/lib/admin/bumpPlanSettingsVersion'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

type RankRow = {
  id: string
  name: string
  requiredTeamBusiness: number
  dailyReward: number
  rewardDurationDays: number
  totalReward: number
  sortOrder: number
  iconUrl?: string
  active: boolean
}

export function AdminRanksPage() {
  const { data: siteCfg, ready: siteReady, save: saveSite } = useLiveSiteConfig()
  const [ratioForm, setRatioForm] = useState({ power: '50', rest: '50' })
  const [rows, setRows] = useState<RankRow[]>([])
  const [draft, setDraft] = useState({
    name: 'Director',
    requiredTeamBusiness: 0,
    dailyReward: 0,
    rewardDurationDays: 30,
    totalReward: 0,
    sortOrder: 100,
    iconUrl: '',
    active: true,
  })
  const [seedBusy, setSeedBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    requiredTeamBusiness: 0,
    dailyReward: 0,
    rewardDurationDays: 0,
    totalReward: 0,
    sortOrder: 0,
    iconUrl: '',
    active: true,
  })

  useEffect(() => {
    if (!siteReady) return
    setRatioForm({
      power: String(siteCfg.rankQualificationPowerPercent ?? 50),
      rest: String(siteCfg.rankQualificationRestPercent ?? 50),
    })
  }, [siteCfg, siteReady])

  useEffect(() => {
    return onSnapshot(query(collection(db, COLLECTIONS.ranks), limit(400)), (snap) => {
      const next: RankRow[] = []
      snap.forEach((ds) => {
        const x = ds.data() as Record<string, unknown>
        const daily = Number(x.dailyReward ?? 0)
        const dur = Number(x.rewardDurationDays ?? x.durationDays ?? 0)
        const stored = Number(x.totalReward ?? 0)
        next.push({
          id: ds.id,
          name: String(x.name ?? ''),
          requiredTeamBusiness: Number(x.requiredTeamBusiness ?? x.teamBiz ?? 0),
          dailyReward: daily,
          rewardDurationDays: dur,
          totalReward: stored > 0 ? stored : daily * dur,
          sortOrder: Number(x.sortOrder ?? x.requiredTeamBusiness ?? 0),
          iconUrl: x.iconUrl != null ? String(x.iconUrl) : undefined,
          active: Boolean(x.active),
        })
      })
      next.sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.requiredTeamBusiness - b.requiredTeamBusiness))
      setRows(next)
    })
  }, [])

  const persistRatio = async () => {
    const power = Number(ratioForm.power)
    const rest = Number(ratioForm.rest)
    if (!Number.isFinite(power) || !Number.isFinite(rest) || power < 0 || rest < 0 || power + rest <= 0) {
      toast.error('Power and Rest must be non-negative and sum above zero')
      return
    }
    try {
      await saveSite(
        { rankQualificationPowerPercent: power, rankQualificationRestPercent: rest },
        'adminRankQualificationRatio',
        { bumpPlanVersion: true },
      )
      toast.success('Business ratio saved — affects new package activations')
    } catch {
      toast.error('Could not save ratio')
    }
  }

  const addRank = async () => {
    const daily = draft.dailyReward
    const dur = draft.rewardDurationDays
    const tot = draft.totalReward > 0 ? draft.totalReward : daily * dur
    try {
      await addDoc(collection(db, COLLECTIONS.ranks), {
        name: draft.name.trim(),
        requiredTeamBusiness: draft.requiredTeamBusiness,
        dailyReward: daily,
        rewardDurationDays: dur,
        totalReward: tot,
        sortOrder: draft.sortOrder,
        iconUrl: draft.iconUrl.trim() || '',
        active: draft.active,
        updatedAt: serverTimestamp(),
      })
      await pushAuditLog('adminRankUpsert', { mode: 'add', draft })
      await bumpPlanSettingsVersion()
      toast.success('Rank stored')
      setDraft((d) => ({ ...d, name: `${d.name}+`, sortOrder: d.sortOrder + 10 }))
    } catch {
      toast.error('Failed to persist rank metadata')
    }
  }

  const startEdit = (r: RankRow) => {
    setEditingId(r.id)
    setEditForm({
      name: r.name,
      requiredTeamBusiness: r.requiredTeamBusiness,
      dailyReward: r.dailyReward,
      rewardDurationDays: r.rewardDurationDays,
      totalReward: r.totalReward,
      sortOrder: r.sortOrder,
      iconUrl: r.iconUrl ?? '',
      active: r.active,
    })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId) return
    const daily = editForm.dailyReward
    const dur = editForm.rewardDurationDays
    const tot = editForm.totalReward > 0 ? editForm.totalReward : daily * dur
    try {
      await updateDoc(doc(db, COLLECTIONS.ranks, editingId), {
        name: editForm.name.trim(),
        requiredTeamBusiness: editForm.requiredTeamBusiness,
        dailyReward: daily,
        rewardDurationDays: dur,
        totalReward: tot,
        sortOrder: editForm.sortOrder,
        iconUrl: editForm.iconUrl.trim(),
        active: editForm.active,
        updatedAt: serverTimestamp(),
      })
      await pushAuditLog('adminRankUpsert', { mode: 'update', id: editingId })
      await bumpPlanSettingsVersion()
      toast.success('Rank updated')
      setEditingId(null)
    } catch {
      toast.error('Update failed')
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove rank row?')) return
    await deleteDoc(doc(db, COLLECTIONS.ranks, id))
    await pushAuditLog('adminRankDelete', { id })
    await bumpPlanSettingsVersion()
    if (editingId === id) setEditingId(null)
  }

  const seedReferenceRanks = async () => {
    if (!window.confirm('Insert the reference Giant rank rows for any missing document IDs?')) return
    setSeedBusy(true)
    try {
      const fn = getHttpsCallable('adminSeedCompensationDefaults')
      const res = await fn({ seedTeamLevels: false, seedRanks: true })
      const out = res.data as { ranksInserted?: number }
      toast.success(
        out?.ranksInserted != null ? `Reference ranks inserted: ${out.ranksInserted}` : 'Seed completed',
      )
    } catch {
      toast.error('Seed failed — admin sign-in required')
    } finally {
      setSeedBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Rank Bonus Settings</h1>
        <p className="text-sm text-zinc-500">
          Leadership rewards: team business targets, fixed-duration daily drip, and power/rest ratio for qualification.
        </p>
        <div className="mt-3">
          <Button type="button" variant="outline" className="text-xs" disabled={seedBusy} onClick={() => void seedReferenceRanks()}>
            {seedBusy ? 'Seeding…' : 'Insert reference ranks (missing only)'}
          </Button>
        </div>
      </div>

      <Card className="space-y-3 border-red-900/25 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Rank qualification — business ratio</h2>
        <p className="text-xs text-zinc-500">
          Each rank target applies to total team business and separately to power / rest legs (normalized to 100%). Used
          for new activations and stored on the member snapshot.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Power business %</Label>
            <Input value={ratioForm.power} onChange={(e) => setRatioForm((r) => ({ ...r, power: e.target.value }))} />
          </div>
          <div>
            <Label>Rest business %</Label>
            <Input value={ratioForm.rest} onChange={(e) => setRatioForm((r) => ({ ...r, rest: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="danger" className="w-full text-xs" onClick={() => void persistRatio()}>
              Save ratio &amp; bump plan version
            </Button>
          </div>
        </div>
      </Card>

      <Card className="grid gap-3 border-red-900/25 p-4 md:grid-cols-2 lg:grid-cols-4">
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
          <Input
            type="number"
            value={draft.dailyReward}
            onChange={(e) => setDraft((d) => ({ ...d, dailyReward: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Reward duration (days)</Label>
          <Input
            type="number"
            value={draft.rewardDurationDays}
            onChange={(e) => setDraft((d) => ({ ...d, rewardDurationDays: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Total reward (optional)</Label>
          <Input
            type="number"
            value={draft.totalReward}
            onChange={(e) => setDraft((d) => ({ ...d, totalReward: Number(e.target.value) }))}
            placeholder={`${draft.dailyReward * draft.rewardDurationDays || ''}`}
          />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            value={draft.sortOrder}
            onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Icon / badge URL</Label>
          <Input value={draft.iconUrl} onChange={(e) => setDraft((d) => ({ ...d, iconUrl: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400 md:col-span-2">
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
        Add rank blueprint
      </Button>

      <Card className="overflow-x-auto border-red-900/25 p-0">
        <table className="w-full min-w-[840px] text-xs">
          <thead className="bg-red-950/30 text-[10px] uppercase text-red-950/85">
            <tr>
              <th className="px-3 py-2 text-left text-zinc-500">Rank</th>
              <th className="px-3 py-2 text-left text-zinc-500">Team biz</th>
              <th className="px-3 py-2 text-zinc-500">Daily</th>
              <th className="px-3 py-2 text-zinc-500">Dur</th>
              <th className="px-3 py-2 text-zinc-500">Total</th>
              <th className="px-3 py-2 text-zinc-500">Order</th>
              <th className="px-3 py-2 text-zinc-500">Active</th>
              <th className="sticky right-0 z-[1] min-w-[200px] bg-zinc-950 px-3 py-2 text-right text-zinc-500">⋯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEd = editingId === r.id
              return (
                <tr key={r.id} className="border-b border-zinc-900">
                  <td className="px-3 py-2">
                    {isEd ? (
                      <Input className="h-8 py-1 text-[11px]" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEd ? (
                      <Input
                        type="number"
                        className="h-8 py-1 text-[11px]"
                        value={editForm.requiredTeamBusiness}
                        onChange={(e) => setEditForm((f) => ({ ...f, requiredTeamBusiness: Number(e.target.value) }))}
                      />
                    ) : (
                      `$${r.requiredTeamBusiness.toLocaleString()}`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEd ? (
                      <Input
                        type="number"
                        className="h-8 py-1 text-[11px]"
                        value={editForm.dailyReward}
                        onChange={(e) => setEditForm((f) => ({ ...f, dailyReward: Number(e.target.value) }))}
                      />
                    ) : (
                      `$${r.dailyReward}`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEd ? (
                      <Input
                        type="number"
                        className="h-8 py-1 text-[11px]"
                        value={editForm.rewardDurationDays}
                        onChange={(e) => setEditForm((f) => ({ ...f, rewardDurationDays: Number(e.target.value) }))}
                      />
                    ) : (
                      `${r.rewardDurationDays}d`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEd ? (
                      <Input
                        type="number"
                        className="h-8 py-1 text-[11px]"
                        value={editForm.totalReward}
                        onChange={(e) => setEditForm((f) => ({ ...f, totalReward: Number(e.target.value) }))}
                      />
                    ) : (
                      `$${r.totalReward.toLocaleString()}`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEd ? (
                      <Input
                        type="number"
                        className="h-8 py-1 text-[11px]"
                        value={editForm.sortOrder}
                        onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                      />
                    ) : (
                      r.sortOrder
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEd ? (
                      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
                        <input
                          type="checkbox"
                          className="accent-red-600"
                          checked={editForm.active}
                          onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                        />
                        On
                      </label>
                    ) : (
                      <span className={r.active ? 'text-green-400' : 'text-zinc-600'}>{r.active ? 'Yes' : 'No'}</span>
                    )}
                  </td>
                  <td className="sticky right-0 z-[1] bg-zinc-950 px-3 py-2 text-right">
                    {isEd ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="outline" className="text-[10px]" onClick={() => void saveEdit()}>
                          Update
                        </Button>
                        <Button type="button" variant="ghost" className="text-[10px]" onClick={cancelEdit}>
                          Cancel
                        </Button>
                        <Button type="button" variant="outline" className="text-[10px]" onClick={() => void remove(r.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="outline" className="text-[10px]" onClick={() => startEdit(r)}>
                          Edit
                        </Button>
                        <Button type="button" variant="outline" className="text-[10px]" onClick={() => void remove(r.id)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
