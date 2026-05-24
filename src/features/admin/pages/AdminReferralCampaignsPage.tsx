import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { adminListReferralCampaignCompletionsCallable } from '@/lib/api/adminCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { COLLECTIONS } from '@/lib/constants'
import { db, storage } from '@/lib/firebase'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import type {
  ReferralCampaign,
  ReferralCampaignCompletionRow,
  ReferralCampaignTier,
} from '@/types/models'

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
  const [completionsLoading, setCompletionsLoading] = useState(false)
  const [completions, setCompletions] = useState<ReferralCampaignCompletionRow[]>([])
  const [completionsLoaded, setCompletionsLoaded] = useState(false)
  const [completionTierFilter, setCompletionTierFilter] = useState('')

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

  const completionsByTier = useMemo(() => {
    const map = new Map<string, ReferralCampaignCompletionRow[]>()
    for (const row of completions) {
      const key = row.tierId
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return map
  }, [completions])

  const loadCompletions = async () => {
    setCompletionsLoading(true)
    try {
      const res = await adminListReferralCampaignCompletionsCallable({
        campaignId: selectedId,
        tierId: completionTierFilter || undefined,
      })
      setCompletions(res.completions)
      setCompletionsLoaded(true)
      toast.success(`Found ${res.total} completed reward${res.total === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(
        getCallableErrorMessage(err) || 'Could not load — deploy adminListReferralCampaignCompletions',
      )
      setCompletions([])
    } finally {
      setCompletionsLoading(false)
    }
  }

  useEffect(() => {
    setCompletions([])
    setCompletionsLoaded(false)
  }, [selectedId])

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
      if (
        form.bannerEnabled &&
        !form.bannerImageUrl?.trim() &&
        !form.bannerMessage.trim()
      ) {
        toast.error('Popup banner needs an image and/or message')
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

  const uploadBannerImage = async (file: File) => {
    setBusy(true)
    try {
      const path = `site/referral_campaigns/${selectedId}/banner_${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const r = ref(storage, path)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      setForm((f) => ({ ...f, bannerImageUrl: url }))
      toast.success('Banner image uploaded — click Save campaign')
    } catch {
      toast.error('Upload failed — check Storage rules')
    } finally {
      setBusy(false)
    }
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
        <h2 className="text-lg font-medium text-[#d4af37]">Dashboard popup banner</h2>
        <p className="text-sm text-[#9898a8]">
          When the campaign is <strong className="text-[#e4e4e7]">Active</strong> and inside the date window, members see a
          popup with your image and/or message every time they open the dashboard (no permanent dismiss).
          Closing the popup scrolls them to the <strong className="text-[#e4e4e7]">New flyer rewards</strong> section below.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.bannerEnabled}
            onChange={(e) => setForm((f) => ({ ...f, bannerEnabled: e.target.checked }))}
          />
          Show popup banner on member dashboard
        </label>
        <div>
          <Label>Banner title (popup header)</Label>
          <Input
            value={form.bannerTitle ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, bannerTitle: e.target.value }))}
            placeholder={form.title}
          />
        </div>
        <div>
          <Label>Popup image (optional)</Label>
          {form.bannerImageUrl ? (
            <img
              src={form.bannerImageUrl}
              alt="Banner preview"
              className="mb-3 mt-2 max-h-48 rounded-lg border border-[rgba(212,175,55,0.3)] object-contain"
            />
          ) : (
            <p className="mt-1 text-xs text-[#6b6b7c]">No image — message-only popup is OK.</p>
          )}
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[10px]">Upload PNG / JPG</Label>
              <Input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadBannerImage(file)
                  e.target.value = ''
                }}
              />
            </div>
            <div>
              <Label className="text-[10px]">Or paste image URL</Label>
              <Input
                value={form.bannerImageUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, bannerImageUrl: e.target.value }))}
              />
            </div>
          </div>
          {form.bannerImageUrl ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => setForm((f) => ({ ...f, bannerImageUrl: undefined }))}
            >
              Remove image
            </Button>
          ) : null}
        </div>
        <div>
          <Label>Banner message (optional if image is set)</Label>
          <textarea
            className="mt-1 w-full rounded border border-[#444] bg-[#1a1a1a] p-3 text-sm text-white"
            rows={3}
            value={form.bannerMessage}
            onChange={(e) => setForm((f) => ({ ...f, bannerMessage: e.target.value }))}
            placeholder="Short text under the image in the popup"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[#aaa]">Dismiss version: {form.bannerDismissVersion}</span>
          <Button type="button" variant="outline" onClick={bumpBannerVersion}>
            Bump version (legacy — optional audit note when banner content changes)
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-[#d4af37]">Completed rewards</h2>
            <p className="mt-1 text-sm text-[#a8a8b8]">
              Members who finished a tier for this campaign (User ID, name, email, mobile).
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Filter tier</Label>
              <select
                className="mt-1 rounded border border-[#444] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
                value={completionTierFilter}
                onChange={(e) => setCompletionTierFilter(e.target.value)}
              >
                <option value="">All tiers</option>
                {form.tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.rewardLabel}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={completionsLoading}
              onClick={() => void loadCompletions()}
            >
              {completionsLoading ? 'Loading…' : completionsLoaded ? 'Refresh list' : 'Load completed members'}
            </Button>
          </div>
        </div>

        {!completionsLoaded ? (
          <p className="text-sm text-[#888]">Click “Load completed members” to scan who qualified for each reward.</p>
        ) : completions.length === 0 ? (
          <p className="text-sm text-[#888]">No members have completed a reward tier for this campaign yet.</p>
        ) : (
          <div className="space-y-6">
            {form.tiers
              .filter((t) => !completionTierFilter || t.id === completionTierFilter)
              .map((tier) => {
                const rows = completionsByTier.get(tier.id) ?? []
                if (rows.length === 0) return null
                return (
                  <div key={tier.id} className="space-y-2">
                    <h3 className="text-sm font-semibold text-[#5cb85c]">
                      ✓ {tier.rewardSubtitle ? `${tier.rewardSubtitle} → ` : ''}
                      {tier.rewardLabel}
                      <span className="ml-2 font-normal text-[#aaa]">({rows.length} member{rows.length === 1 ? '' : 's'})</span>
                    </h3>
                    <div className="admin-panel-sheet overflow-hidden p-0">
                      <div className="max-w-[100vw] overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left text-[12px] text-[#c4c4ce]">
                          <thead className="border-b border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b7c]">
                              <th className="px-3 py-2.5 pl-4">User ID</th>
                              <th className="px-3 py-2.5">Name</th>
                              <th className="px-3 py-2.5">Email</th>
                              <th className="px-3 py-2.5">Mobile</th>
                              <th className="px-3 py-2.5">Auth UID</th>
                              <th className="px-3 py-2.5">Directs</th>
                              <th className="px-3 py-2.5 pr-4">Package $</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr
                                key={`${row.tierId}-${row.uid}`}
                                className="border-b border-[rgba(212,175,55,0.08)] hover:bg-[rgba(212,175,55,0.03)]"
                              >
                                <td className="px-3 py-2.5 pl-4 font-medium text-[#e4e4e7]">{row.username || '—'}</td>
                                <td className="px-3 py-2.5">{row.fullName || '—'}</td>
                                <td className="px-3 py-2.5">{row.email || '—'}</td>
                                <td className="px-3 py-2.5">{row.phone || '—'}</td>
                                <td className="px-3 py-2.5 font-mono text-[10px] text-[#9898a8]">{row.uid}</td>
                                <td className="px-3 py-2.5">{row.qualifyingDirectCount}</td>
                                <td className="px-3 py-2.5 pr-4">{row.memberPrincipal}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </Card>

      <Button type="button" disabled={busy} onClick={() => void persist()}>
        {busy ? 'Saving…' : 'Save campaign'}
      </Button>
    </div>
  )
}
