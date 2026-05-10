import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useLiveSiteConfig } from '@/hooks/admin/useLiveSiteConfig'

export function AdminSiteSettings() {
  const { data, ready, save } = useLiveSiteConfig()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    maintenanceMode: false,
    siteName: 'Rich Pay',
    currencyLabel: 'USDT',
    timezone: 'UTC',
    supportEmail: '',
    supportWhatsapp: '',
    logoUrl: '',
    faviconUrl: '',
    socialTelegram: '',
    socialTwitter: '',
    minDeposit: '50',
    minWithdrawal: '10',
    withdrawFeePercent: '10',
    sponsorPercent: '5',
    teamLevelsCount: '30',
    publicPlansSponsorBody: '',
    publicPlansSponsorPill: '',
    publicPlansTeamLead: '',
    publicPlansRankFootnote: '',
    publicPlansGuidelineExtra: '',
    publicContactResponseTime: '',
    publicContactHeroSub: '',
    publicContactFooterNote: '',
  })

  useEffect(() => {
    if (!ready) return
    setForm({
      maintenanceMode: Boolean(data.maintenanceMode),
      siteName: String(data.siteName ?? 'Rich Pay'),
      currencyLabel: String(data.currencyLabel ?? 'USDT'),
      timezone: String(data.timezone ?? 'UTC'),
      supportEmail: String(data.supportEmail ?? ''),
      supportWhatsapp: String(data.supportWhatsapp ?? ''),
      logoUrl: String(data.logoUrl ?? ''),
      faviconUrl: String(data.faviconUrl ?? ''),
      socialTelegram: String(data.socialTelegram ?? ''),
      socialTwitter: String(data.socialTwitter ?? ''),
      minDeposit: String(data.minDeposit ?? 50),
      minWithdrawal: String(data.minWithdrawal ?? 10),
      withdrawFeePercent: String(data.withdrawFeePercent ?? 10),
      sponsorPercent: String(data.sponsorPercent ?? 5),
      teamLevelsCount: String(data.teamLevelsCount ?? 30),
      publicPlansSponsorBody: String(data.publicPlansSponsorBody ?? ''),
      publicPlansSponsorPill: String(data.publicPlansSponsorPill ?? ''),
      publicPlansTeamLead: String(data.publicPlansTeamLead ?? ''),
      publicPlansRankFootnote: String(data.publicPlansRankFootnote ?? ''),
      publicPlansGuidelineExtra: String(data.publicPlansGuidelineExtra ?? ''),
      publicContactResponseTime: String(data.publicContactResponseTime ?? ''),
      publicContactHeroSub: String(data.publicContactHeroSub ?? ''),
      publicContactFooterNote: String(data.publicContactFooterNote ?? ''),
    })
  }, [data, ready])

  const persist = async () => {
    setBusy(true)
    try {
      const tlChanged = Number(form.teamLevelsCount) !== Number(data.teamLevelsCount ?? 30)
      const spChanged = Number(form.sponsorPercent) !== Number(data.sponsorPercent ?? 5)
      const wdChanged =
        Number(form.minWithdrawal) !== Number(data.minWithdrawal ?? 10) ||
        Number(form.withdrawFeePercent) !== Number(data.withdrawFeePercent ?? 10)
      await save(
        {
          maintenanceMode: form.maintenanceMode,
          siteName: form.siteName.trim(),
          currencyLabel: form.currencyLabel.trim(),
          timezone: form.timezone.trim(),
          supportEmail: form.supportEmail.trim(),
          supportWhatsapp: form.supportWhatsapp.trim(),
          logoUrl: form.logoUrl.trim(),
          faviconUrl: form.faviconUrl.trim(),
          socialTelegram: form.socialTelegram.trim(),
          socialTwitter: form.socialTwitter.trim(),
          minDeposit: Number(form.minDeposit),
          minWithdrawal: Number(form.minWithdrawal),
          withdrawFeePercent: Number(form.withdrawFeePercent),
          sponsorPercent: Number(form.sponsorPercent),
          teamLevelsCount: Number(form.teamLevelsCount),
          publicPlansSponsorBody: form.publicPlansSponsorBody.trim(),
          publicPlansSponsorPill: form.publicPlansSponsorPill.trim(),
          publicPlansTeamLead: form.publicPlansTeamLead.trim(),
          publicPlansRankFootnote: form.publicPlansRankFootnote.trim(),
          publicPlansGuidelineExtra: form.publicPlansGuidelineExtra.trim(),
          publicContactResponseTime: form.publicContactResponseTime.trim(),
          publicContactHeroSub: form.publicContactHeroSub.trim(),
          publicContactFooterNote: form.publicContactFooterNote.trim(),
        },
        'adminSiteSettings',
        {
          bumpPlanVersion: tlChanged || spChanged,
          bumpWithdrawPoliciesVersion: wdChanged,
        },
      )
      toast.success('Site configuration saved — members see updates in real time')
    } catch {
      toast.error('Save failed — check connection and Firestore permissions')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h1 className="font-display text-2xl text-zinc-100">Site Settings</h1>

      {!ready ? (
        <p className="text-sm text-zinc-500">Loading configuration…</p>
      ) : (
        <>
          <Card className="space-y-4 border-red-900/25 bg-red-950/10 p-6">
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="accent-red-600"
                checked={form.maintenanceMode}
                onChange={(e) => setForm((s) => ({ ...s, maintenanceMode: e.target.checked }))}
              />
              Maintenance mode (landing + marketing pages)
            </label>
          </Card>

          <Card className="grid gap-4 border-red-900/25 md:grid-cols-2 [&>div]:space-y-2 [&_label]:text-zinc-500 p-6">
            <div>
              <Label>Site name</Label>
              <Input value={form.siteName} onChange={(e) => setForm((s) => ({ ...s, siteName: e.target.value }))} />
            </div>
            <div>
              <Label>Displayed currency label</Label>
              <Input
                value={form.currencyLabel}
                onChange={(e) => setForm((s) => ({ ...s, currencyLabel: e.target.value }))}
              />
            </div>
            <div>
              <Label>Timezone label</Label>
              <Input value={form.timezone} onChange={(e) => setForm((s) => ({ ...s, timezone: e.target.value }))} />
            </div>
            <div>
              <Label>Team level depth mirrored to rewards engine</Label>
              <Input
                value={form.teamLevelsCount}
                onChange={(e) => setForm((s) => ({ ...s, teamLevelsCount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Support email</Label>
              <Input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm((s) => ({ ...s, supportEmail: e.target.value }))}
              />
            </div>
            <div>
              <Label>WhatsApp (E.164 optional)</Label>
              <Input
                value={form.supportWhatsapp}
                onChange={(e) => setForm((s) => ({ ...s, supportWhatsapp: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Logo image URL</Label>
              <Input value={form.logoUrl} onChange={(e) => setForm((s) => ({ ...s, logoUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Favicon URL</Label>
              <Input
                value={form.faviconUrl}
                onChange={(e) => setForm((s) => ({ ...s, faviconUrl: e.target.value }))}
              />
            </div>
            <div>
              <Label>Telegram (URL or @username)</Label>
              <Input
                placeholder="https://t.me/YourChannel or @YourChannel"
                value={form.socialTelegram}
                onChange={(e) => setForm((s) => ({ ...s, socialTelegram: e.target.value }))}
              />
            </div>
            <div>
              <Label>Twitter URL</Label>
              <Input
                value={form.socialTwitter}
                onChange={(e) => setForm((s) => ({ ...s, socialTwitter: e.target.value }))}
              />
            </div>
          </Card>

          <Card className="grid gap-4 border-red-900/25 md:grid-cols-1 [&>div]:space-y-2 p-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Public contact page</h2>
              <p className="text-xs text-zinc-500">
                Uses support email &amp; Telegram from above. Published on <code>/contact</code> for visitors.
              </p>
            </div>
            <div>
              <Label>Response time line</Label>
              <Input
                placeholder="Within 2–4 hours"
                value={form.publicContactResponseTime}
                onChange={(e) => setForm((s) => ({ ...s, publicContactResponseTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>Hero subtitle (optional)</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-xl border border-zinc-800 bg-black/55 px-3 py-2 text-sm text-zinc-100"
                placeholder="Short line under Contact / Support headline…"
                value={form.publicContactHeroSub}
                onChange={(e) => setForm((s) => ({ ...s, publicContactHeroSub: e.target.value }))}
              />
            </div>
            <div>
              <Label>Footer note — “Official Info” column (optional)</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-xl border border-zinc-800 bg-black/55 px-3 py-2 text-sm text-zinc-100"
                placeholder="Support hours or policy snippet…"
                value={form.publicContactFooterNote}
                onChange={(e) => setForm((s) => ({ ...s, publicContactFooterNote: e.target.value }))}
              />
            </div>
          </Card>

          <Card className="grid gap-4 border-red-900/25 md:grid-cols-2 [&>div]:space-y-2 p-6">
            <div>
              <Label>Minimum deposit</Label>
              <Input value={form.minDeposit} onChange={(e) => setForm((s) => ({ ...s, minDeposit: e.target.value }))} />
            </div>
            <div>
              <Label>Minimum withdrawal</Label>
              <Input
                value={form.minWithdrawal}
                onChange={(e) => setForm((s) => ({ ...s, minWithdrawal: e.target.value }))}
              />
            </div>
            <div>
              <Label>Withdrawal fee (%)</Label>
              <Input
                value={form.withdrawFeePercent}
                onChange={(e) => setForm((s) => ({ ...s, withdrawFeePercent: e.target.value }))}
              />
            </div>
            <div>
              <Label>Sponsor bonus (%)</Label>
              <Input
                value={form.sponsorPercent}
                onChange={(e) => setForm((s) => ({ ...s, sponsorPercent: e.target.value }))}
              />
            </div>
          </Card>

          <Card className="grid gap-4 border-red-900/25 md:grid-cols-1 [&>div]:space-y-2 p-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Public investment plans copy</h2>
              <p className="text-xs text-zinc-500">
                Plain text shown on <code>/plans</code> next to sponsor %, team section, ranks footnote, and guidelines.
              </p>
            </div>
            <div>
              <Label>Sponsor paragraph (optional)</Label>
              <textarea
                className="flex min-h-[88px] w-full rounded-xl border border-zinc-800 bg-black/55 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-700"
                placeholder="Describe how sponsor income works..."
                value={form.publicPlansSponsorBody}
                onChange={(e) => setForm((s) => ({ ...s, publicPlansSponsorBody: e.target.value }))}
              />
            </div>
            <div>
              <Label>Sponsor badge / highlight (optional)</Label>
              <Input
                placeholder="Example line under sponsor block"
                value={form.publicPlansSponsorPill}
                onChange={(e) => setForm((s) => ({ ...s, publicPlansSponsorPill: e.target.value }))}
              />
            </div>
            <div>
              <Label>Team levels intro (optional)</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-xl border border-zinc-800 bg-black/55 px-3 py-2 text-sm text-zinc-100"
                placeholder="Lead sentence above the level timeline…"
                value={form.publicPlansTeamLead}
                onChange={(e) => setForm((s) => ({ ...s, publicPlansTeamLead: e.target.value }))}
              />
            </div>
            <div>
              <Label>Rank milestones footnote (optional)</Label>
              <Input
                value={form.publicPlansRankFootnote}
                onChange={(e) => setForm((s) => ({ ...s, publicPlansRankFootnote: e.target.value }))}
              />
            </div>
            <div>
              <Label>Guidelines — extra paragraph (optional)</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-xl border border-zinc-800 bg-black/55 px-3 py-2 text-sm text-zinc-100"
                placeholder="Additional policy notes appended after withdrawal/deposit ROI cards…"
                value={form.publicPlansGuidelineExtra}
                onChange={(e) => setForm((s) => ({ ...s, publicPlansGuidelineExtra: e.target.value }))}
              />
            </div>
          </Card>

          <Button type="button" className="w-full md:w-auto" variant="danger" disabled={busy} onClick={() => void persist()}>
            {busy ? 'Saving…' : 'Publish configuration'}
          </Button>
        </>
      )}
    </motion.div>
  )
}
