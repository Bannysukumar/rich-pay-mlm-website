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
import { bumpPlanSettingsVersion } from '@/lib/admin/bumpPlanSettingsVersion'
import { getHttpsCallable } from '@/lib/api/httpsCallableHelper'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils/cn'
import type { PackageDef, PackageShelf } from '@/types/models'

/** Matches RICH PAY PDF five fixed tiers (investment / daily lane). */
const PDF_PLAN_TIERS_SEED: Array<{
  name: string
  minAmount: number
  maxAmount: number
  roiPercent: number
  durationDays: number
  maxRoiMultiplier: number
  sortOrder: number
}> = [
  { name: 'Tier 1', minAmount: 100, maxAmount: 100, roiPercent: 1, durationDays: 200, maxRoiMultiplier: 2, sortOrder: 10 },
  { name: 'Tier 2', minAmount: 200, maxAmount: 200, roiPercent: 2, durationDays: 100, maxRoiMultiplier: 2, sortOrder: 20 },
  { name: 'Tier 3', minAmount: 300, maxAmount: 300, roiPercent: 3, durationDays: 66, maxRoiMultiplier: 2, sortOrder: 30 },
  { name: 'Tier 4', minAmount: 400, maxAmount: 400, roiPercent: 4, durationDays: 50, maxRoiMultiplier: 2, sortOrder: 40 },
  { name: 'Tier 5', minAmount: 500, maxAmount: 500, roiPercent: 5, durationDays: 40, maxRoiMultiplier: 2, sortOrder: 50 },
]

type Row = PackageDef & {
  description?: string
}

export function AdminPackagesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [shelfTab, setShelfTab] = useState<Exclude<PackageShelf, undefined>>('investment')

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.packages), limit(200))
    return onSnapshot(q, (snap) => {
      const next: Row[] = []
      snap.forEach((ds) => {
        const d = ds.data() as Record<string, unknown>
        const shelfRaw = String(d.packageShelf ?? 'investment').toLowerCase()
        const packageShelf: PackageShelf = shelfRaw === 'compounding' ? 'compounding' : 'investment'
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
          packageShelf,
        })
      })
      next.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      setRows(next)
    })
  }, [])

  const visibleRows = useMemo(() => {
    return rows.filter((r) =>
      shelfTab === 'compounding'
        ? (r.packageShelf ?? 'investment') === 'compounding'
        : (r.packageShelf ?? 'investment') !== 'compounding',
    )
  }, [rows, shelfTab])

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
      packageShelf: shelfTab,
    }),
    [rows, shelfTab],
  )

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
        packageShelf: data.packageShelf ?? 'investment',
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
      await bumpPlanSettingsVersion()
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
      await bumpPlanSettingsVersion()
      toast.success('Package removed')
    } catch {
      toast.error('Delete failed')
    }
  }

  const seedPdfTiers = async () => {
    if (!window.confirm('Add the five canonical PDF tiers (skip any amount already published)?')) return
    setBusy(true)
    try {
      let n = 0
      for (const t of PDF_PLAN_TIERS_SEED) {
        const exists = rows.some((r) => r.minAmount === t.minAmount && r.maxAmount === t.maxAmount)
        if (exists) continue
        await addDoc(collection(db, COLLECTIONS.packages), {
          name: t.name,
          minAmount: t.minAmount,
          maxAmount: t.maxAmount,
          roiPercent: t.roiPercent,
          durationDays: t.durationDays,
          active: true,
          packageShelf: 'investment',
          description: `Total return ${t.maxRoiMultiplier * 100}% · PDF tier`,
          sortOrder: t.sortOrder,
          maxRoiMultiplier: t.maxRoiMultiplier,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        n++
      }
      await pushAuditLog('adminPackageSeedPdfTiers', { added: n })
      await bumpPlanSettingsVersion()
      toast.success(n ? `Inserted ${n} package(s)` : 'All PDF tiers already exist')
    } catch {
      toast.error('Seed failed — check Firestore permissions')
    } finally {
      setBusy(false)
    }
  }

  const seedRichCompounding = async () => {
    if (!window.confirm('Insert Rich Compounding reference tiers (missing document IDs only)?')) return
    setBusy(true)
    try {
      const fn = getHttpsCallable('adminSeedCompensationDefaults')
      const res = await fn({
        seedTeamLevels: false,
        seedRanks: false,
        seedCompoundPlans: true,
      })
      const out = res.data as { compoundPlansInserted?: number }
      await bumpPlanSettingsVersion()
      toast.success(out?.compoundPlansInserted != null ? `Inserted ${out.compoundPlansInserted}` : 'Compounding seed done')
    } catch {
      toast.error('Compound seed failed — deploy functions / admin login')
    } finally {
      setBusy(false)
    }
  }

  const cloneRow = async (r: Row) => {
    setBusy(true)
    try {
      const ref = await addDoc(collection(db, COLLECTIONS.packages), {
        name: `${r.name} (copy)`,
        minAmount: r.minAmount,
        maxAmount: r.maxAmount,
        roiPercent: r.roiPercent,
        durationDays: r.durationDays,
        active: r.active,
        packageShelf: r.packageShelf ?? 'investment',
        description: `${r.description ?? ''} cloned`,
        sortOrder: (r.sortOrder ?? 0) + 1,
        maxRoiMultiplier: r.maxRoiMultiplier ?? 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await pushAuditLog('adminPackageClone', { from: r.id, to: ref.id })
      await bumpPlanSettingsVersion()
      toast.success('Package cloned — edit fields as needed')
    } catch {
      toast.error('Clone failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">Package Management</h1>
        <p className="text-sm text-zinc-500">
          Separate lanes for classic investment tiers and Rich Compounding. Saves bump{' '}
          <code className="text-zinc-600">planSettingsVersion</code> for snapshot correlation.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 border-b border-red-950/35 pb-2">
          <button
            type="button"
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide',
              shelfTab === 'investment'
                ? 'bg-red-700/85 text-white'
                : 'text-zinc-500 hover:bg-zinc-900/80',
            )}
            onClick={() => setShelfTab('investment')}
          >
            Investment (daily ROI)
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide',
              shelfTab === 'compounding'
                ? 'bg-red-700/85 text-white'
                : 'text-zinc-500 hover:bg-zinc-900/80',
            )}
            onClick={() => setShelfTab('compounding')}
          >
            Rich Compounding
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {shelfTab === 'investment' ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void seedPdfTiers()}>
              Seed PDF five tiers ($100–$500)
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void seedRichCompounding()}>
              Seed reference compounding tiers ($500–$100)
            </Button>
          )}
        </div>
      </div>

      <PackageForm title="Publish new tier" initial={blank} busy={busy} onSubmit={(data) => void persist(undefined, data)} />

      <div className="space-y-4">
        {visibleRows.map((r) => (
          <PackageForm
            key={r.id}
            title={`Tier · ${r.name || r.id}`}
            subtitle={r.id}
            initial={r}
            busy={busy}
            footer={
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="text-[11px]" onClick={() => void cloneRow(r)}>
                  Clone
                </Button>
                <Button type="button" variant="outline" className="text-[11px]" onClick={() => void remove(r.id)}>
                  Archive / delete tier
                </Button>
              </div>
            }
            onSubmit={(data) => void persist(r.id, data)}
          />
        ))}
        {visibleRows.length === 0 && (
          <p className="text-sm text-zinc-600">No packages in this lane yet — publish above or run a seed helper.</p>
        )}
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
        <Field label="Lane">
          <select
            className="w-full rounded-xl border border-zinc-900 bg-black/55 px-3 py-2 text-xs text-zinc-200 outline-none ring-red-900/50 focus:border-red-800"
            value={f.packageShelf ?? 'investment'}
            onChange={(e) => set('packageShelf')(e.target.value as PackageShelf)}
          >
            <option value="investment">Investment (daily ROI)</option>
            <option value="compounding">Rich Compounding</option>
          </select>
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
        <Field label={f.packageShelf === 'compounding' ? 'ROI % (compounding curve)' : 'ROI % (daily reference)'}>
          <Input type="number" step="0.0001" value={f.roiPercent} onChange={(e) => set('roiPercent')(Number(e.target.value))} />
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
