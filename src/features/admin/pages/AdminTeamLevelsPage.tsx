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
import { useEffect, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { bumpPlanSettingsVersion } from '@/lib/admin/bumpPlanSettingsVersion'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils/cn'

type LvlRow = {
  id: string
  level: number
  percent: number
  requiredDirects: number
  conditionDescription: string
  active: boolean
  sortOrder: number
}

function TableActionBtn({
  children,
  onClick,
  variant,
}: {
  children: ReactNode
  onClick: () => void
  variant: 'gold' | 'danger' | 'muted'
}) {
  const styles =
    variant === 'danger'
      ? 'border border-red-500/50 bg-red-600/90 text-white hover:bg-red-500'
      : variant === 'gold'
        ? 'border border-[rgba(212,175,55,0.45)] bg-[rgba(212,175,55,0.1)] text-[#f5e6a8] hover:bg-[rgba(212,175,55,0.2)]'
        : 'border border-zinc-600 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-w-[4.5rem] items-center justify-center rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide',
        styles,
      )}
    >
      {children}
    </button>
  )
}

export function AdminTeamLevelsPage() {
  const [rows, setRows] = useState<LvlRow[]>([])
  const [draft, setDraft] = useState({
    level: 1,
    percent: 0,
    requiredDirects: 0,
    conditionDescription: '',
    active: true,
    sortOrder: 0,
  })
  const [bulk, setBulk] = useState({
    fromLvl: 1,
    toLvl: 30,
    percent: 3,
    requiredDirects: 6,
    conditionDescription: 'At least 6 active direct referrals',
  })
  const [seedBusy, setSeedBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    level: 0,
    percent: 0,
    requiredDirects: 0,
    conditionDescription: '',
    active: true,
    sortOrder: 0,
  })

  useEffect(() => {
    return onSnapshot(query(collection(db, COLLECTIONS.teamLevels), limit(500)), (snap) => {
      const next: LvlRow[] = []
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>
        next.push({
          id: d.id,
          level: Number(x.level ?? 0),
          percent: Number(x.percent ?? 0),
          requiredDirects: Number(x.requiredDirects ?? x.directs ?? 0),
          conditionDescription: String(x.conditionDescription ?? '').trim(),
          active: Boolean(x.active),
          sortOrder: Number(x.sortOrder ?? x.level ?? 0),
        })
      })
      next.sort((a, b) => a.sortOrder - b.sortOrder)
      setRows(next)
    })
  }, [])

  const startEdit = (r: LvlRow) => {
    setEditingId(r.id)
    setEditForm({
      level: r.level,
      percent: r.percent,
      requiredDirects: r.requiredDirects,
      conditionDescription: r.conditionDescription,
      active: r.active,
      sortOrder: r.sortOrder,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      await updateDoc(doc(db, COLLECTIONS.teamLevels, editingId), {
        level: editForm.level,
        percent: editForm.percent,
        requiredDirects: editForm.requiredDirects,
        conditionDescription: editForm.conditionDescription.trim(),
        active: editForm.active,
        sortOrder: editForm.sortOrder,
        updatedAt: serverTimestamp(),
      })
      await pushAuditLog('adminTeamLevelUpdate', { id: editingId, ...editForm })
      await bumpPlanSettingsVersion()
      toast.success('Team level updated')
      setEditingId(null)
    } catch {
      toast.error('Could not update — check permissions')
    }
  }

  const addLevel = async () => {
    try {
      await addDoc(collection(db, COLLECTIONS.teamLevels), {
        ...draft,
        conditionDescription: draft.conditionDescription.trim(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      await pushAuditLog('adminTeamLevelAdd', draft)
      await bumpPlanSettingsVersion()
      toast.success('Team level added')
      setDraft((d) => ({ ...d, level: d.level + 1, sortOrder: d.sortOrder + 10 }))
    } catch {
      toast.error('Could not persist level row')
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this level configuration?')) return
    try {
      await deleteDoc(doc(db, COLLECTIONS.teamLevels, id))
      await pushAuditLog('adminTeamLevelDelete', { id })
      await bumpPlanSettingsVersion()
      toast.success('Deleted')
      if (editingId === id) setEditingId(null)
    } catch {
      toast.error('Could not delete')
    }
  }

  const applyBulkRange = async () => {
    const lo = Math.min(bulk.fromLvl, bulk.toLvl)
    const hi = Math.max(bulk.fromLvl, bulk.toLvl)
    const targets = rows.filter((r) => r.level >= lo && r.level <= hi)
    if (targets.length === 0) {
      toast.error('No rows in that level range — add levels first or adjust range')
      return
    }
    try {
      for (const r of targets) {
        await updateDoc(doc(db, COLLECTIONS.teamLevels, r.id), {
          percent: bulk.percent,
          requiredDirects: bulk.requiredDirects,
          conditionDescription: bulk.conditionDescription.trim(),
          updatedAt: serverTimestamp(),
        })
      }
      await pushAuditLog('adminTeamLevelBulk', { lo, hi, ...bulk })
      await bumpPlanSettingsVersion()
      toast.success(`Updated ${targets.length} level rows`)
    } catch {
      toast.error('Bulk update failed')
    }
  }

  const seedReferenceTeamLevels = async () => {
    if (!window.confirm('Insert the standard 30-level reference matrix for any missing document IDs?')) return
    setSeedBusy(true)
    try {
      const fn = getHttpsCallable('adminSeedCompensationDefaults')
      const res = await fn({ seedTeamLevels: true, seedRanks: false })
      const data = res.data as { teamLevelsInserted?: number }
      toast.success(
        data?.teamLevelsInserted != null
          ? `Reference team levels inserted: ${data.teamLevelsInserted}`
          : 'Seed completed',
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
        <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Team Level Settings</h1>
        <p className="text-sm text-[#9898a8]">
          Commission matrix for team-level bonuses. Use <strong>Edit</strong> → <strong>Update</strong> on each row or add
          new levels below.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="text-xs"
            disabled={seedBusy}
            onClick={() => void seedReferenceTeamLevels()}
          >
            {seedBusy ? 'Seeding…' : 'Insert reference team levels (missing only)'}
          </Button>
        </div>
      </div>

      <div className="admin-panel-sheet space-y-3 p-4">
        <h2 className="text-sm font-semibold text-[#e4e4e7]">Bulk update by level range</h2>
        <p className="text-xs text-[#9898a8]">
          Applies %, required active directs, and condition text to every saved row whose level index falls in the range.
        </p>
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <Label>From level</Label>
            <Input
              type="number"
              value={bulk.fromLvl}
              onChange={(e) => setBulk((b) => ({ ...b, fromLvl: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>To level</Label>
            <Input
              type="number"
              value={bulk.toLvl}
              onChange={(e) => setBulk((b) => ({ ...b, toLvl: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Commission %</Label>
            <Input
              type="number"
              value={bulk.percent}
              onChange={(e) => setBulk((b) => ({ ...b, percent: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Required directs</Label>
            <Input
              type="number"
              value={bulk.requiredDirects}
              onChange={(e) => setBulk((b) => ({ ...b, requiredDirects: Number(e.target.value) }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Condition description</Label>
            <Input
              value={bulk.conditionDescription}
              onChange={(e) => setBulk((b) => ({ ...b, conditionDescription: e.target.value }))}
            />
          </div>
        </div>
        <Button type="button" variant="danger" className="text-xs" onClick={() => void applyBulkRange()}>
          Apply to range
        </Button>
      </div>

      <div className="admin-panel-sheet space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <Label>New — level index</Label>
            <Input
              type="number"
              value={draft.level}
              onChange={(e) => setDraft((d) => ({ ...d, level: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Commission %</Label>
            <Input
              type="number"
              value={draft.percent}
              onChange={(e) => setDraft((d) => ({ ...d, percent: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Required directs</Label>
            <Input
              type="number"
              value={draft.requiredDirects}
              onChange={(e) => setDraft((d) => ({ ...d, requiredDirects: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Ordering</Label>
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs text-[#9898a8]">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={draft.active}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              />
              Enabled
            </label>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="danger" className="w-full md:w-auto" onClick={() => void addLevel()}>
              Add level
            </Button>
          </div>
        </div>
        <div>
          <Label>Condition description (optional)</Label>
          <textarea
            className="focus:border-rich-gold/50 min-h-[4rem] w-full rounded-xl border border-zinc-600 bg-black/35 px-3 py-2 text-xs text-[#e4e4e7] outline-none"
            placeholder="e.g. No condition / At least N active direct referrals"
            value={draft.conditionDescription}
            onChange={(e) => setDraft((d) => ({ ...d, conditionDescription: e.target.value }))}
          />
        </div>
      </div>

      <div className="admin-panel-sheet overflow-hidden p-0">
        <div className="max-w-[100vw] overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[12px] text-[#c4c4ce]">
            <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                <th className="px-3 py-2.5 pl-4">Lvl</th>
                <th className="px-3 py-2.5">%</th>
                <th className="px-3 py-2.5">Directs</th>
                <th className="px-3 py-2.5 min-w-[200px]">Condition</th>
                <th className="px-3 py-2.5">Sort</th>
                <th className="px-3 py-2.5">Active</th>
                <th className="sticky right-0 z-[1] min-w-[200px] bg-[#1a1d21] px-3 py-2.5 pr-4 text-right shadow-[inset_1px_0_0_rgba(212,175,55,0.08)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#9898a8]">
                    No team levels yet. Add one above.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isEditing = editingId === r.id
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-[rgba(212,175,55,0.08)]',
                        isEditing && 'bg-[rgba(212,175,55,0.06)]',
                      )}
                    >
                      <td className="px-3 py-2 pl-4">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-8 py-1 text-xs"
                            value={editForm.level}
                            onChange={(e) => setEditForm((f) => ({ ...f, level: Number(e.target.value) }))}
                          />
                        ) : (
                          <span className="font-mono text-[#e4e4e7]">{r.level}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-8 py-1 text-xs"
                            value={editForm.percent}
                            onChange={(e) => setEditForm((f) => ({ ...f, percent: Number(e.target.value) }))}
                          />
                        ) : (
                          r.percent
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-8 py-1 text-xs"
                            value={editForm.requiredDirects}
                            onChange={(e) => setEditForm((f) => ({ ...f, requiredDirects: Number(e.target.value) }))}
                          />
                        ) : (
                          r.requiredDirects
                        )}
                      </td>
                      <td className="max-w-[240px] px-3 py-2 align-top">
                        {isEditing ? (
                          <textarea
                            className="focus:border-rich-gold/40 min-h-[3rem] w-full rounded-lg border border-zinc-600 bg-black/30 px-2 py-1 text-[11px] text-[#e4e4e7]"
                            value={editForm.conditionDescription}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, conditionDescription: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="block text-[11px] leading-snug text-[#a1a1b0]">
                            {r.conditionDescription || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-8 py-1 text-xs"
                            value={editForm.sortOrder}
                            onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                          />
                        ) : (
                          r.sortOrder
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <label className="flex items-center gap-2 text-xs text-[#9898a8]">
                            <input
                              type="checkbox"
                              className="accent-amber-500"
                              checked={editForm.active}
                              onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                            />
                            On
                          </label>
                        ) : (
                          <span className={r.active ? 'text-[#4ade80]' : 'text-[#6b6b7c]'}>{r.active ? 'Yes' : 'No'}</span>
                        )}
                      </td>
                      <td className="sticky right-0 z-[1] bg-[#1a1d21] px-3 py-2 pr-4 align-middle shadow-[inset_1px_0_0_rgba(212,175,55,0.06)]">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <TableActionBtn variant="gold" onClick={() => void saveEdit()}>
                                Update
                              </TableActionBtn>
                              <TableActionBtn variant="muted" onClick={cancelEdit}>
                                Cancel
                              </TableActionBtn>
                              <TableActionBtn variant="danger" onClick={() => void remove(r.id)}>
                                Delete
                              </TableActionBtn>
                            </>
                          ) : (
                            <>
                              <TableActionBtn variant="gold" onClick={() => startEdit(r)}>
                                Edit
                              </TableActionBtn>
                              <TableActionBtn variant="danger" onClick={() => void remove(r.id)}>
                                Delete
                              </TableActionBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
