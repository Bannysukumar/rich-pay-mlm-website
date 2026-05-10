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
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { PackageDef } from '@/types/models'

type Row = PackageDef & {
  description?: string
  sortOrder?: number
  maxRoiMultiplier?: number
}

export function AdminPackagesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.packages), limit(200))
    return onSnapshot(q, (snap) => {
      const next: Row[] = []
      snap.forEach((ds) => {
        const d = ds.data() as Record<string, unknown>
        next.push({
          id: ds.id,
          name: String(d.name ?? ''),
          minAmount: Number(d.minAmount ?? 0),
          maxAmount: Number(d.maxAmount ?? 0),
          roiPercent: Number(d.roiPercent ?? 0),
          durationDays: Number(d.durationDays ?? 0),
          active: d.active !== undefined ? Boolean(d.active) : true,
          description: d.description != null ? String(d.description) : '',
          sortOrder: Number(d.sortOrder ?? 0),
          maxRoiMultiplier: Number(d.maxRoiMultiplier ?? 2),
        })
      })
      next.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      setRows(next)
    })
  }, [])

  const persist = useCallback(async (maybeId: string | undefined, data: Omit<Row, 'id'>) => {
    setBusy(true)
    try {
      const payload = {
        name: data.name.trim(),
        minAmount: Number(data.minAmount),
        maxAmount: Number(data.maxAmount),
        roiPercent: Number(data.roiPercent),
        durationDays: Number(data.durationDays),
        active: data.active,
        description: String(data.description ?? ''),
        sortOrder: Number(data.sortOrder ?? 0),
        maxRoiMultiplier: Number(data.maxRoiMultiplier ?? 2),
        updatedAt: serverTimestamp(),
      }
      if (maybeId) {
        await updateDoc(doc(db, COLLECTIONS.packages, maybeId), payload)
        await pushAuditLog('adminPackageUpdate', { id: maybeId, payload })
      } else {
        const ref = await addDoc(collection(db, COLLECTIONS.packages), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        await pushAuditLog('adminPackageCreate', { id: ref.id, payload })
      }
      toast.success(maybeId ? 'Package saved' : 'Package created')
    } catch {
      toast.error('Save failed — check indexes or permissions')
    } finally {
      setBusy(false)
    }
  }, [])

  const remove = async (id: string) => {
    if (!window.confirm('Remove this tier from the storefront?')) return
    try {
      await deleteDoc(doc(db, COLLECTIONS.packages, id))
      await pushAuditLog('adminPackageDelete', { id })
      toast.success('Package removed')
    } catch {
      toast.error('Delete failed')
    }
  }

  const blank = useMemo(
    (): Omit<Row, 'id'> => ({
      name: '',
      minAmount: 0,
      maxAmount: 0,
      roiPercent: 0,
      durationDays: 30,
      active: true,
      description: '',
      sortOrder: rows.length ? Math.max(...rows.map((r) => r.sortOrder ?? 0)) + 10 : 0,
      maxRoiMultiplier: 2,
    }),
    [rows],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Package Management</h1>
        <p className="text-sm text-zinc-500">Publishing here updates live quoting on the dashboard instantly.</p>
      </div>

      <PackageForm title="Publish new tier" initial={blank} busy={busy} onSubmit={(data) => void persist(undefined, data)} />

      <div className="space-y-4">
        {rows.map((r) => (
          <PackageForm
            key={r.id}
            title={`Tier · ${r.name || r.id}`}
            subtitle={r.id}
            initial={r}
            busy={busy}
            footer={
              <Button type="button" variant="outline" className="text-[11px]" onClick={() => void remove(r.id)}>
                Archive / delete tier
              </Button>
            }
            onSubmit={(data) => void persist(r.id, data)}
          />
        ))}
      </div>
    </div>
  )
}

function PackageForm({
  title,
  subtitle,
  initial,
  busy,
  footer,
  onSubmit,
}: {
  title: string
  subtitle?: string
  initial: Omit<Row, 'id'>
  busy: boolean
  footer?: ReactNode
  onSubmit: (data: Omit<Row, 'id'>) => void
}) {
  const [f, setF] = useState(initial)

  useEffect(() => {
    setF(initial)
  }, [initial])

  const set =
    <K extends keyof Omit<Row, 'id'>>(field: K) =>
    (v: Omit<Row, 'id'>[K]) =>
      setF((s) => ({ ...s, [field]: v }))

  return (
    <Card className="space-y-3 border-red-900/25 p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-red-900/85">{title}</p>
          {subtitle && <p className="mt-1 font-mono text-[11px] text-zinc-600">{subtitle}</p>}
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => set('active')(e.target.checked)}
            className="accent-red-600"
          />
          Active
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Marketing name">
          <Input value={f.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label="Sort order">
          <Input type="number" value={f.sortOrder ?? 0} onChange={(e) => set('sortOrder')(Number(e.target.value))} />
        </Field>
        <Field label="Min amount (USDT)">
          <Input type="number" value={f.minAmount} onChange={(e) => set('minAmount')(Number(e.target.value))} />
        </Field>
        <Field label="Max amount (USDT)">
          <Input type="number" value={f.maxAmount} onChange={(e) => set('maxAmount')(Number(e.target.value))} />
        </Field>
        <Field label="ROI % (daily reference)">
          <Input type="number" step="0.01" value={f.roiPercent} onChange={(e) => set('roiPercent')(Number(e.target.value))} />
        </Field>
        <Field label="Duration (days)">
          <Input type="number" value={f.durationDays} onChange={(e) => set('durationDays')(Number(e.target.value))} />
        </Field>
        <Field label="Max payout multiplier vs principal">
          <Input
            type="number"
            step="0.1"
            value={f.maxRoiMultiplier ?? 2}
            onChange={(e) => set('maxRoiMultiplier')(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={f.description ?? ''}
          onChange={(e) => set('description')(e.target.value)}
          className="min-h-[80px] w-full rounded-xl border border-zinc-900 bg-transparent px-3 py-2 text-xs text-zinc-200 outline-none ring-red-900/50 focus:border-red-800"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" disabled={busy || !f.name.trim()} onClick={() => onSubmit({ ...f })}>
          Commit changes
        </Button>
        {footer}
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
