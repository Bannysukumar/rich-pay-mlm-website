import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import type { ReferralCampaign, ReferralCampaignTier } from '@/types/models'

const DEFAULT_CAMPAIGN_ID = 'flyer-promo'

const DEFAULT_TIERS: ReferralCampaignTier[] = [
  {
    id: 'tier-tab',
    sortOrder: 10,
    rewardSubtitle: '$200 Join',
    rewardLabel: 'TAB',
    minMemberPackageAmount: 200,
    requiredDirectReferrals: 10,
  },
  {
    id: 'tier-bangkok',
    sortOrder: 20,
    rewardSubtitle: '$300 Join',
    rewardLabel: 'Bangkok 4 days 3 nights',
    minMemberPackageAmount: 300,
    requiredDirectReferrals: 10,
  },
]

function msFromDatetimeLocal(v: string): number {
  if (!v) return 0
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

function datetimeLocalFromMs(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyCampaign(id: string): ReferralCampaign {
  const now = Date.now()
  const week = now + 7 * 24 * 3600 * 1000
  return {
    id,
    title: 'New flyer rewards',
    subtitle: 'Direct referral promotion',
    theme: 'new-flyer',
    active: false,
    startAt: now,
    endAt: week,
    tiers: DEFAULT_TIERS.map((t) => ({ ...t })),
    bannerEnabled: true,
    bannerTitle: 'New flyer rewards',
    bannerMessage: 'Complete your join package and 10 direct referrals to unlock rewards.',
    bannerDismissVersion: 1,
    updatedAt: now,
  }
}

export function AdminReferralCampaignsPage() {
  const [campaignIds, setCampaignIds] = useState<string[]>([DEFAULT_CAMPAIGN_ID])
  const [selectedId, setSelectedId] = useState(DEFAULT_CAMPAIGN_ID)
  const [form, setForm] = useState<ReferralCampaign>(() => emptyCampaign(DEFAULT_CAMPAIGN_ID))
  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void getDocs(collection(db, COLLECTIONS.referralCampaigns)).then((snap) => {
      const ids = snap.docs.map((d) => d.id).sort()
      if (ids.length > 0) setCampaignIds(ids)
    })
  }, [])

  useEffect(() => {
    setReady(false)
    const ref = doc(db, COLLECTIONS.referralCampaigns, selectedId)
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>
        const tiers = Array.isArray(d.tiers)
          ? (d.tiers as ReferralCampaignTier[]).map((t, i) => ({
              id: String((t as ReferralCampaignTier).id ?? `tier-${i + 1}`),
              sortOrder: Number((t as ReferralCampaignTier).sortOrder ?? (i + 1) * 10),
              rewardLabel: String((t as ReferralCampaignTier).rewardLabel ?? ''),
              rewardSubtitle:
                (t as ReferralCampaignTier).rewardSubtitle != null
                  ? String((t as ReferralCampaignTier).rewardSubtitle)
                  : undefined,
              minMemberPackageAmount:
                (t as ReferralCampaignTier).minMemberPackageAmount != null
                  ? Number((t as ReferralCampaignTier).minMemberPackageAmount)
                  : undefined,
              requiredDirectReferrals: Math.max(
                1,
                Number((t as ReferralCampaignTier).requiredDirectReferrals ?? 10),
              ),
              requireMemberActivePackage: (t as ReferralCampaignTier).requireMemberActivePackage !== false,
              requireDirectActivePackage: (t as ReferralCampaignTier).requireDirectActivePackage !== false,
              directMustRegisterInCampaignWindow:
                (t as ReferralCampaignTier).directMustRegisterInCampaignWindow !== false,
            }))
          : DEFAULT_TIERS.map((t) => ({ ...t }))
        const c: ReferralCampaign = {
          id: snap.id,
          title: String(d.title ?? ''),
          subtitle: d.subtitle != null ? String(d.subtitle) : undefined,
          theme: d.theme != null ? String(d.theme) : 'new-flyer',
          active: d.active === true,
          startAt: Number(d.startAt ?? 0),
          endAt: Number(d.endAt ?? 0),
          tiers,
          bannerEnabled: d.bannerEnabled !== false,
          bannerTitle: d.bannerTitle != null ? String(d.bannerTitle) : undefined,
          bannerMessage: String(d.bannerMessage ?? ''),
          bannerImageUrl: d.bannerImageUrl != null ? String(d.bannerImageUrl) : undefined,
          bannerDismissVersion: Math.max(0, Number(d.bannerDismissVersion ?? 1)),
          updatedAt: Number(d.updatedAt ?? 0),
        }
        setForm(c)
        setStartLocal(datetimeLocalFromMs(c.startAt))
        setEndLocal(datetimeLocalFromMs(c.endAt))
      } else {
        const c = emptyCampaign(selectedId)
        setForm(c)
        setStartLocal(datetimeLocalFromMs(c.startAt))
        setEndLocal(datetimeLocalFromMs(c.endAt))
      }
      setReady(true)
    })
  }, [selectedId])

  const windowLabel = useMemo(() => {
    if (!form.startAt || !form.endAt) return 'Set start and end'
    return `${new Date(form.startAt).toLocaleString()} → ${new Date(form.endAt).toLocaleString()}`
  }, [form.startAt, form.endAt])

  const persist = async () => {
    setBusy(true)
    try {
      const startAt = msFromDatetimeLocal(startLocal)
      const endAt = msFromDatetimeLocal(endLocal)
      if (!startAt || !endAt || endAt <= startAt) {
        toast.error('End must be after start')
        return
      }
      const tiers = form.tiers
        .filter((t) => t.rewardLabel.trim())
        .map((t, i) => ({
          ...t,
          id: t.id || `tier-${i + 1}`,
          sortOrder: Number(t.sortOrder ?? (i + 1) * 10),
          requiredDirectReferrals: Math.max(1, Number(t.requiredDirectReferrals ?? 10)),
        }))
      if (tiers.length === 0) {
        toast.error('Add at least one reward tier')
        return
      }
      const payload = {
        title: form.title.trim() || 'Referral rewards',
        subtitle: form.subtitle?.trim() || null,
        theme: form.theme?.trim() || 'new-flyer',
        active: form.active,
        startAt,
        endAt,
        tiers,
        bannerEnabled: form.bannerEnabled,
        bannerTitle: form.bannerTitle?.trim() || null,
        bannerMessage: form.bannerMessage.trim(),
        bannerImageUrl: form.bannerImageUrl?.trim() || null,
        bannerDismissVersion: Math.max(0, Number(form.bannerDismissVersion ?? 1)),
        updatedAt: Date.now(),
      }
      await setDoc(doc(db, COLLECTIONS.referralCampaigns, selectedId), payload, { merge: true })
      await pushAuditLog('adminReferralCampaignSave', { campaignId: selectedId, active: form.active })
      toast.success('Campaign saved')
      if (!campaignIds.includes(selectedId)) setCampaignIds((prev) => [...prev, selectedId].sort())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const bumpBannerVersion = () => {
    setForm((f) => ({ ...f, bannerDismissVersion: (f.bannerDismissVersion ?? 0) + 1 }))
    toast.success('Banner version bumped — save to apply')
  }

  const addTier = () => {
    setForm((f) => ({
      ...f,
      tiers: [
        ...f.tiers,
        {
          id: `tier-${Date.now()}`,
          sortOrder: (f.tiers.length + 1) * 10,
          rewardLabel: '',
          requiredDirectReferrals: 10,
          requireMemberActivePackage: true,
          requireDirectActivePackage: true,
          directMustRegisterInCampaignWindow: true,
        },
      ],
    }))
  }

  const updateTier = (idx: number, patch: Partial<ReferralCampaignTier>) => {
    setForm((f) => ({
      ...f,
      tiers: f.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }))
  }

  const removeTier = (idx: number) => {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }))
  }

  if (!ready) {
    return (
      <div className="p-6 text-[#a8a8b8]">
        Loading referral campaigns…
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#f5f5f5]">Referral reward campaigns</h1>
        <p className="mt-1 text-sm text-[#a8a8b8]">
          New flyer theme: set window, reward tiers (e.g. $200 → TAB, $300 → Bangkok), and dashboard banner.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Campaign document ID</Label>
            <select
              className="mt-1 rounded border border-[#444] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {campaignIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const id = prompt('New campaign ID (e.g. flyer-promo-2)')?.trim()
              if (!id) return
              setCampaignIds((prev) => (prev.includes(id) ? prev : [...prev, id].sort()))
              setSelectedId(id)
            }}
          >
            New campaign ID
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              value={form.subtitle ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            />
          </div>
          <div>
            <Label>Theme key</Label>
            <Input
              value={form.theme ?? 'new-flyer'}
              onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="camp-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            <label htmlFor="camp-active" className="text-sm text-[#ddd]">
              Campaign active (shown when inside date window)
            </label>
          </div>
          <div>
            <Label>Start (local)</Label>
            <Input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => {
                setStartLocal(e.target.value)
                setForm((f) => ({ ...f, startAt: msFromDatetimeLocal(e.target.value) }))
              }}
            />
          </div>
          <div>
            <Label>End (local)</Label>
            <Input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => {
                setEndLocal(e.target.value)
                setForm((f) => ({ ...f, endAt: msFromDatetimeLocal(e.target.value) }))
              }}
            />
          </div>
        </div>
        <p className="text-xs text-[#888]">Window: {windowLabel}</p>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#d4af37]">Reward tiers</h2>
          <Button type="button" variant="outline" onClick={addTier}>
            Add tier
          </Button>
        </div>
        {form.tiers.map((tier, idx) => (
          <div key={tier.id} className="rounded border border-[#333] p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Reward (e.g. TAB)</Label>
                <Input
                  value={tier.rewardLabel}
                  onChange={(e) => updateTier(idx, { rewardLabel: e.target.value })}
                />
              </div>
              <div>
                <Label>Subtitle (e.g. $200 Join)</Label>
                <Input
                  value={tier.rewardSubtitle ?? ''}
                  onChange={(e) => updateTier(idx, { rewardSubtitle: e.target.value })}
                />
              </div>
              <div>
                <Label>Min join package ($)</Label>
                <Input
                  type="number"
                  value={tier.minMemberPackageAmount ?? ''}
                  onChange={(e) =>
                    updateTier(idx, {
                      minMemberPackageAmount: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
              <div>
                <Label>Direct referrals required</Label>
                <Input
                  type="number"
                  value={tier.requiredDirectReferrals}
                  onChange={(e) =>
                    updateTier(idx, { requiredDirectReferrals: Math.max(1, Number(e.target.value) || 10) })
                  }
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={tier.sortOrder}
                  onChange={(e) => updateTier(idx, { sortOrder: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tier.requireMemberActivePackage !== false}
                  onChange={(e) => updateTier(idx, { requireMemberActivePackage: e.target.checked })}
                />
                Member needs active package
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tier.requireDirectActivePackage !== false}
                  onChange={(e) => updateTier(idx, { requireDirectActivePackage: e.target.checked })}
                />
                Direct must have active package
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tier.directMustRegisterInCampaignWindow !== false}
                  onChange={(e) => updateTier(idx, { directMustRegisterInCampaignWindow: e.target.checked })}
                />
                Direct registered in campaign window
              </label>
            </div>
            <Button type="button" variant="outline" onClick={() => removeTier(idx)}>
              Remove tier
            </Button>
          </div>
        ))}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-medium text-[#d4af37]">Dashboard banner</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.bannerEnabled}
            onChange={(e) => setForm((f) => ({ ...f, bannerEnabled: e.target.checked }))}
          />
          Show banner on member dashboard
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Banner title</Label>
            <Input
              value={form.bannerTitle ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, bannerTitle: e.target.value }))}
            />
          </div>
          <div>
            <Label>Image URL (optional)</Label>
            <Input
              value={form.bannerImageUrl ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, bannerImageUrl: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label>Banner message</Label>
          <textarea
            className="mt-1 w-full rounded border border-[#444] bg-[#1a1a1a] p-3 text-sm text-white"
            rows={3}
            value={form.bannerMessage}
            onChange={(e) => setForm((f) => ({ ...f, bannerMessage: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[#aaa]">Dismiss version: {form.bannerDismissVersion}</span>
          <Button type="button" variant="outline" onClick={bumpBannerVersion}>
            Bump version (re-show for users who dismissed)
          </Button>
        </div>
      </Card>

      <Button type="button" disabled={busy} onClick={() => void persist()}>
        {busy ? 'Saving…' : 'Save campaign'}
      </Button>
    </div>
  )
}
