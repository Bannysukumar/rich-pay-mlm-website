import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { CopySimple, Link as LinkIcon } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import {
  dismissReferralCampaignBannerCallable,
  getReferralCampaignProgressCallable,
} from '@/lib/api/referralCampaignCallables'
import type { ReferralCampaignProgressResult, UserProfile } from '@/types/models'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import {
  computeMaxWithdrawForPrincipal,
  fmtNextAutoSummary,
  formatWithdrawalAllowedWeekdays,
  isWithdrawalAllowedNow,
  isWithdrawalDayAllowed,
  livePolicyFromSiteSettings,
  mergeWithdrawPolicy,
} from '@/lib/withdrawPolicy'
import { isLiveActivePackage } from '@/lib/activePackagesDisplay'
import { referralTierBarHud } from '@/lib/referralCampaignProgress'

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** Activations with immutable `planSnapshot` schema v2 (post–compensation-freeze flow). Legacy packages are excluded. */
function isNewSchemaPackage(planSnapshot: unknown): boolean {
  if (!planSnapshot || typeof planSnapshot !== 'object') return false
  return Number((planSnapshot as Record<string, unknown>).schemaVersion) === 2
}

type PkgIncomeRow = {
  status: string
  /** True when this row counts toward "Active packages (total)" and live working-cap split. */
  liveActive: boolean
  amount: number
  nonWorkingPaid: number
  schemaV2: boolean
  wMult: number
}

function fmtCapMult(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return '?'
  if (Math.abs(m - Math.round(m)) < 1e-6) return String(Math.round(m))
  return String(m)
}

/**
 * Non-working earned: sum of `nonWorkingPaid` on v2 snapshot packages only (any status).
 * Working earned: `totalWorkingIncome` when every active stake is v2; if only legacy stakes are active, 0;
 * if mixed active stakes, allocate by working-cap weight (principal × frozen working mult).
 */
function deriveNewSchemaIncomeHud(
  rows: PkgIncomeRow[],
  totalWorkingIncome: number,
): { nwEarned: number; wValue: number; showWorkingSplitNote: boolean } {
  let nwEarned = 0
  let newActiveCap = 0
  let legacyActiveCap = 0
  for (const p of rows) {
    if (p.schemaV2) nwEarned += p.nonWorkingPaid
    if (!p.liveActive) continue
    const capPart = Math.max(0, p.amount) * Math.max(0, p.wMult)
    if (p.schemaV2) newActiveCap += capPart
    else legacyActiveCap += capPart
  }
  const totalActiveCap = newActiveCap + legacyActiveCap
  const tw = Math.max(0, Number(totalWorkingIncome) || 0)
  if (totalActiveCap <= 1e-9) {
    return { nwEarned, wValue: tw, showWorkingSplitNote: false }
  }
  if (newActiveCap <= 1e-9) {
    return { nwEarned, wValue: 0, showWorkingSplitNote: false }
  }
  if (legacyActiveCap <= 1e-9) {
    return { nwEarned, wValue: tw, showWorkingSplitNote: false }
  }
  return {
    nwEarned,
    wValue: tw * (newActiveCap / totalActiveCap),
    showWorkingSplitNote: true,
  }
}

function normalizePowerRest(pRaw: number, rRaw: number): { p: number; r: number } {
  let p = Math.max(0, pRaw)
  let r = Math.max(0, rRaw)
  const s = p + r
  if (!Number.isFinite(s) || s <= 0) return { p: 50, r: 50 }
  return { p: (p / s) * 100, r: (r / s) * 100 }
}

function computeRankHud(profile: UserProfile, livePowerPct?: number, liveRestPct?: number) {
  const snap = profile.rankCompensationSnapshot
  const fallbackP = normalizePowerRest(
    Number(livePowerPct ?? 50),
    Number(liveRestPct ?? 50),
  )
  let pPct = fallbackP.p
  let rPct = fallbackP.r
  const ranksRaw = snap?.ranks?.length ? snap.ranks : null
  if (snap?.rankQualificationPowerPercent != null && snap.rankQualificationRestPercent != null) {
    const n = normalizePowerRest(
      Number(snap.rankQualificationPowerPercent),
      Number(snap.rankQualificationRestPercent),
    )
    pPct = n.p
    rPct = n.r
  }
  const completed = new Set(profile.completedRankRewardIds ?? [])
  const ordered =
    ranksRaw?.slice().sort((a, b) => {
      const so = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
      return so !== 0
        ? so
        : Number(a.requiredTeamBusiness ?? 0) - Number(b.requiredTeamBusiness ?? 0)
    }) ?? []

  const nextIncomplete = ordered.find((rk) => !completed.has(String(rk.id)))

  let nextLine = ''
  let progressPct = 0
  if (nextIncomplete) {
    const req = Number(nextIncomplete.requiredTeamBusiness ?? 0)
    const needP = (req * pPct) / 100
    const needR = (req * rPct) / 100
    const tb = profile.totalTeamBusiness
    const pb = profile.powerTeamBusiness
    const rb = profile.restTeamBusiness
    const tRatio = req > 0 ? Math.min(1, tb / req) : 1
    const pRatio = needP > 1e-9 ? Math.min(1, pb / needP) : 1
    const rRatio = needR > 1e-9 ? Math.min(1, rb / needR) : 1
    progressPct = Math.round(Math.min(tRatio, pRatio, rRatio) * 100)
    nextLine = `Next: ${nextIncomplete.name} — team $${fmt(tb)} / $${fmt(req)} · power $${fmt(pb)} / $${fmt(needP)} · rest $${fmt(rb)} / $${fmt(needR)}`
  } else if (ordered.length > 0) {
    nextLine = 'All configured ranks in your snapshot are completed.'
    progressPct = 100
  } else {
    nextLine = 'Activate a package to capture the rank ladder for your account.'
  }

  let dripLine = ''
  if (profile.rankRewardActive && (profile.rankRewardTotalDays ?? 0) > 0) {
    const paid = Math.min(profile.rankRewardDaysPaid ?? 0, profile.rankRewardTotalDays ?? 0)
    const total = profile.rankRewardTotalDays ?? 0
    dripLine = `Ranking bonus schedule: day ${paid} of ${total} (${profile.currentRank})`
  }

  return { nextLine, progressPct, dripLine, powerPct: pPct, restPct: rPct }
}

function referralBase(): string {
  const fromEnv = import.meta.env.VITE_REFERRAL_BASE_URL
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function DashboardHome() {
  const { profile, firebaseUid } = useAuthState()
  const { settings } = useSiteSettings()
  const [activePackageTotal, setActivePackageTotal] = useState<number | undefined>(undefined)
  const [maxActivePrincipal, setMaxActivePrincipal] = useState<number | undefined>(undefined)
  const [pkgIncomeRows, setPkgIncomeRows] = useState<PkgIncomeRow[]>([])
  const [clockTick, setClockTick] = useState(0)
  const [campaignProgress, setCampaignProgress] = useState<ReferralCampaignProgressResult | null>(null)

  const refLink = useMemo(() => {
    if (!profile?.username) return ''
    const base = referralBase()
    return `${base}/register?ref=${profile.username}`
  }, [profile?.username])

  useEffect(() => {
    if (!firebaseUid) {
      setCampaignProgress(null)
      return
    }
    let cancelled = false
    void getReferralCampaignProgressCallable()
      .then((res) => {
        if (!cancelled) setCampaignProgress(res)
      })
      .catch(() => {
        if (!cancelled) setCampaignProgress(null)
      })
    return () => {
      cancelled = true
    }
  }, [firebaseUid])

  useEffect(() => {
    if (!firebaseUid) {
      setActivePackageTotal(undefined)
      setMaxActivePrincipal(undefined)
      setPkgIncomeRows([])
      return
    }
    const q = query(
      collection(db, COLLECTIONS.activePackages),
      where('userId', '==', firebaseUid),
      orderBy('startedAt', 'desc'),
    )
    return onSnapshot(
      q,
      (snap) => {
        let sum = 0
        let maxOne = 0
        const rows: PkgIncomeRow[] = []
        const siteW = Number(settings.workingIncomeCapMultiplier ?? 3)
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>
          const status = String(d.status ?? 'active').toLowerCase()
          const liveActive = isLiveActivePackage(d)
          if (liveActive) {
            const amt = Number(d.amount ?? 0)
            sum += amt
            maxOne = Math.max(maxOne, amt)
          }
          const ps = d.planSnapshot as Record<string, unknown> | undefined
          const schemaV2 = isNewSchemaPackage(ps)
          const wMult = Number(
            d.frozenWorkingCapMultiplier ??
              (ps != null && ps.workingIncomeCapMultiplier != null ? Number(ps.workingIncomeCapMultiplier) : siteW),
          )
          rows.push({
            status,
            liveActive,
            amount: Number(d.amount ?? 0),
            nonWorkingPaid: Number(d.nonWorkingPaid ?? 0),
            schemaV2,
            wMult: Number.isFinite(wMult) && wMult > 0 ? wMult : siteW,
          })
        })
        setActivePackageTotal(sum)
        setMaxActivePrincipal(maxOne)
        setPkgIncomeRows(rows)
      },
      () => {
        setActivePackageTotal(0)
        setMaxActivePrincipal(0)
        setPkgIncomeRows([])
        toast.error('Could not load active package total')
      },
    )
  }, [firebaseUid, settings.nonWorkingIncomeCapMultiplier, settings.workingIncomeCapMultiplier])

  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 15_000)
    const onVis = () => setClockTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const withdrawalPolicyMerged = useMemo(
    () =>
      mergeWithdrawPolicy(livePolicyFromSiteSettings(settings), profile?.withdrawalPolicySnapshot ?? undefined),
    [settings, profile?.withdrawalPolicySnapshot],
  )

  const maxWithdrawThisCycle = useMemo(() => {
    if (withdrawalPolicyMerged.withdrawalRequiresActivePackage === false)
      return Number.POSITIVE_INFINITY
    const mx = maxActivePrincipal ?? 0
    if (mx <= 0) return 0
    return computeMaxWithdrawForPrincipal(mx, withdrawalPolicyMerged)
  }, [withdrawalPolicyMerged, maxActivePrincipal])

  const withdrawDayAllowed = useMemo(
    () => isWithdrawalDayAllowed(withdrawalPolicyMerged),
    [withdrawalPolicyMerged, clockTick],
  )
  const withdrawWindowOpen = useMemo(
    () => isWithdrawalAllowedNow(withdrawalPolicyMerged),
    [withdrawalPolicyMerged, clockTick],
  )

  const rankHud = useMemo(() => {
    if (!profile) return null
    return computeRankHud(
      profile,
      settings.rankQualificationPowerPercent,
      settings.rankQualificationRestPercent,
    )
  }, [profile, settings.rankQualificationPowerPercent, settings.rankQualificationRestPercent])

  const newSchemaIncomeHud = useMemo(
    () =>
      deriveNewSchemaIncomeHud(pkgIncomeRows, profile?.totalWorkingIncome ?? 0),
    [pkgIncomeRows, profile?.totalWorkingIncome],
  )

  const showCampaignBanner = useMemo(() => {
    const c = campaignProgress?.campaign
    if (!c?.bannerEnabled || !c.bannerMessage.trim()) return false
    const dismissed = profile?.dismissedReferralCampaignBanners?.[c.id] ?? 0
    return dismissed < (c.bannerDismissVersion ?? 0)
  }, [campaignProgress, profile?.dismissedReferralCampaignBanners])

  const dismissCampaignBanner = async () => {
    const id = campaignProgress?.campaign?.id
    if (!id) return
    try {
      await dismissReferralCampaignBannerCallable(id)
      toast.success('Banner dismissed')
    } catch (err) {
      toast.error(getCallableErrorMessage(err) || 'Could not dismiss banner')
    }
  }

  const copy = async () => {
    if (!refLink) return
    await navigator.clipboard.writeText(refLink)
    toast.success('Referral link copied')
  }

  const shareOnWhatsApp = () => {
    if (!refLink) return
    const message =
      `*JOIN RICHPAY & START EARNING WITH ME!*\n\n` +
      `Hi! I'm earning passive daily income with RichPay, a premium financial growth platform.\n\n` +
      `----------------------------------------\n` +
      `EARNING HIGHLIGHTS:\n` +
      `----------------------------------------\n` +
      `-> Up to 5% Daily ROI on investments\n` +
      `-> 30-Level Referral Commission system\n` +
      `-> Rank bonuses for qualified ranks\n` +
      `-> 5% Instant Sponsor Reward\n\n` +
      `----------------------------------------\n` +
      `SIGN UP USING MY REFERRAL LINK:\n` +
      `----------------------------------------\n\n` +
      `${refLink}\n\n` +
      `Start your financial freedom journey today!\n` +
      `Let's grow together!`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  if (!profile) {
    return (
      <div className="container-fluid p-4">
        <div className="alert alert-warning border border-warning">
          Your profile is provisioning. If this persists, ensure <code>registerWithProfile</code> completed successfully.
        </div>
      </div>
    )
  }

  const sponsorPct = settings.sponsorPercent
  const teamLevels = settings.teamLevelsCount

  const feePct = Number(withdrawalPolicyMerged.withdrawFeePercent ?? settings.withdrawFeePercent)
  const minWd = Number(withdrawalPolicyMerged.minWithdrawal ?? settings.minWithdrawal)
  const capLine =
    !Number.isFinite(maxWithdrawThisCycle)
      ? 'No per-request cap (policy)'
      : maxWithdrawThisCycle <= 0
        ? 'Max per request: — (activate a package first)'
        : `Max per request: $ ${fmt(maxWithdrawThisCycle)}`

  type Stat = { label: string; value: string; tone: 'warning' | 'primary' | 'danger' | 'success' }
  const row1: Stat[] = [
    {
      label: 'Active packages (total)',
      value: activePackageTotal === undefined ? '$ …' : `$ ${fmt(activePackageTotal)}`,
      tone: 'warning',
    },
    { label: 'Cash Wallet', value: `$ ${fmt(profile.wallets.cash)}`, tone: 'primary' },
    { label: 'Activation Wallet', value: `$ ${fmt(profile.wallets.activation)}`, tone: 'danger' },
    { label: 'Deposit Wallet', value: `$ ${fmt(profile.wallets.deposit)}`, tone: 'danger' },
    { label: 'Total Withdrawal', value: `$ ${fmt(profile.totalWithdrawn)}`, tone: 'success' },
  ]

  const row2: Stat[] = [
    { label: 'Active Directs (with package)', value: String(profile.activeDirects), tone: 'primary' },
    { label: 'Sponsor Bonus', value: `$ ${fmt(profile.sponsorBonusTotal)}`, tone: 'danger' },
    { label: 'Daily Profits', value: `$ ${fmt(profile.dailyProfitsTotal)}`, tone: 'warning' },
    { label: 'Team Level Commission', value: `$ ${fmt(profile.teamLevelCommissionTotal)}`, tone: 'success' },
    { label: 'Ranking Bonus (total)', value: `$ ${fmt(profile.rankCommissionTotal)}`, tone: 'success' },
  ]

  const row4: Stat[] = [
    { label: 'Total Team Business', value: `$ ${fmt(profile.totalTeamBusiness)}`, tone: 'primary' },
    {
      label: 'Power team business',
      value: `$ ${fmt(profile.powerTeamBusiness)}`,
      tone: 'primary',
    },
    {
      label: 'Rest team business',
      value: `$ ${fmt(profile.restTeamBusiness)}`,
      tone: 'primary',
    },
    { label: 'Current rank', value: profile.currentRank, tone: 'danger' },
  ]

  const toneBg: Record<Stat['tone'], string> = {
    warning: 'bg-warning',
    primary: 'bg-primary',
    danger: 'bg-danger',
    success: 'bg-success',
  }

  const StatGrid = ({ items }: { items: Stat[] }) => (
    <div className="row g-3 mt-1">
      {items.map((c) => (
        <div key={c.label} className="col-md-6 col-lg-6 col-sm-12">
          <div className="ki-eshop-card">
            <div
              className={`ki-eshop-icon mx-auto text-white ${toneBg[c.tone]}`}
              style={{ opacity: 0.92 }}
            >
              <span className="small fw-bold">$</span>
            </div>
            <h3
              className={
                c.tone === 'primary'
                  ? 'text-primary'
                  : c.tone === 'warning'
                    ? 'text-warning'
                    : c.tone === 'success'
                      ? 'text-success'
                      : 'text-danger'
              }
            >
              {c.value}
            </h3>
            <p className="mg-b-35 f-w-600 txt-ellipsis-1">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <main className="container-fluid py-4 px-3">
      <div className="row mb-4">
        <div className="col-12">
          <h2 style={{ fontWeight: 700, color: '#d4af37' }}>Your Referral Hub</h2>
          <p style={{ color: '#aaa' }} className="mb-0">
            Share your unique link and earn {sponsorPct}% instant commission + {teamLevels}-level team rewards
          </p>
        </div>
      </div>

      {showCampaignBanner && campaignProgress?.campaign ? (
        <div className="row mb-4">
          <div className="col-12">
            <div
              className="position-relative rounded-3 border p-4"
              style={{
                borderColor: 'rgba(212,175,55,0.45)',
                background: 'linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(20,20,20,0.95) 60%)',
              }}
            >
              <button
                type="button"
                className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
                aria-label="Dismiss"
                onClick={() => void dismissCampaignBanner()}
              />
              {campaignProgress.campaign.bannerImageUrl ? (
                <img
                  src={campaignProgress.campaign.bannerImageUrl}
                  alt=""
                  className="mb-3 rounded"
                  style={{ maxHeight: 120, objectFit: 'cover', width: '100%' }}
                />
              ) : null}
              <h3 className="mb-2" style={{ color: '#d4af37', fontWeight: 600 }}>
                {campaignProgress.campaign.bannerTitle || campaignProgress.campaign.title}
              </h3>
              <p className="mb-0" style={{ color: '#ddd' }}>
                {campaignProgress.campaign.bannerMessage}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="row mb-4">
        <div className="col-12">
          <div className="referral-card">
            <div className="referral-header">
              <h4 className="d-flex align-items-center gap-2 flex-wrap">
                <LinkIcon size={28} weight="bold" /> Your Personal Referral Link
              </h4>
              <p className="mb-0 mt-1 small">Share this link with friends & family to start earning</p>
            </div>
            <div className="referral-body">
              <div className="referral-link-box mb-4">
                <CopySimple className="me-2" size={20} color="#d4af37" style={{ verticalAlign: 'middle' }} />
                <Link to={refLink} target="_blank" rel="noreferrer" id="referralLink">
                  {refLink}
                </Link>
              </div>

              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <button type="button" className="btn-copy-ki d-inline-flex align-items-center justify-content-center gap-2" onClick={() => void copy()}>
                    <CopySimple size={20} />
                    Copy Link
                  </button>
                </div>
                <div className="col-md-6">
                  <button
                    type="button"
                    className="btn-whatsapp-ki d-inline-flex align-items-center justify-content-center gap-2"
                    onClick={shareOnWhatsApp}
                  >
                    <FaWhatsapp size={22} />
                    Share on WhatsApp
                  </button>
                </div>
              </div>

              <div className="stats-mini">
                <div className="row text-center">
                  <div className="col-4">
                    <div className="stat-number">{sponsorPct}%</div>
                    <small style={{ color: '#aaa' }}>Direct Sponsor</small>
                  </div>
                  <div className="col-4">
                    <div className="stat-number">{teamLevels}</div>
                    <small style={{ color: '#aaa' }}>Team Levels</small>
                  </div>
                  <div className="col-4">
                    <div className="stat-number">By rank</div>
                    <small style={{ color: '#aaa' }}>Rank Bonus</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <StatGrid items={row1} />

      <div className="row g-3 mt-2">
        <div className="col-md-6 col-sm-12">
          <div className="ki-eshop-card">
            <div className="ki-eshop-icon mx-auto text-white bg-primary" style={{ opacity: 0.92 }}>
              <span className="small fw-bold">$</span>
            </div>
            <h3 className="text-primary">{`$ ${fmt(newSchemaIncomeHud.nwEarned)}`}</h3>
            <p className="mg-b-35 f-w-600 txt-ellipsis-1">
              {`Non Working (${fmtCapMult(Number(settings.nonWorkingIncomeCapMultiplier ?? 2))}×) — earned`}
            </p>
          </div>
        </div>
        <div className="col-md-6 col-sm-12">
          <div className="ki-eshop-card">
            <div className="ki-eshop-icon mx-auto text-white bg-danger" style={{ opacity: 0.92 }}>
              <span className="small fw-bold">$</span>
            </div>
            <h3 className="text-danger">{`$ ${fmt(newSchemaIncomeHud.wValue)}`}</h3>
            <p className="mg-b-35 f-w-600 txt-ellipsis-1">
              {`Working (${fmtCapMult(Number(settings.workingIncomeCapMultiplier ?? 3))}×) — earned`}
            </p>
            {newSchemaIncomeHud.showWorkingSplitNote ? (
              <p className="small mb-0" style={{ color: '#888' }}>
                Share estimated from your active stakes while legacy and new plans overlap.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="row mt-3 mb-2">
        <div className="col-12">
          <div className="alert alert-secondary border mb-0" style={{ borderColor: 'rgba(212,175,55,0.25)' }}>
            <strong style={{ color: '#d4af37' }}>Withdrawals</strong>
            <span className={`ms-2 small ${withdrawalPolicyMerged.withdrawalsEnabled !== false ? 'text-success' : 'text-danger'}`}>
              {withdrawalPolicyMerged.withdrawalsEnabled !== false ? 'enabled' : 'disabled'}
            </span>
            <div className="small mt-2 mb-0" style={{ color: '#ccc' }}>
              Network: <strong className="text-light">{String(withdrawalPolicyMerged.withdrawNetworkLabel ?? settings.depositNetwork)}</strong>
              {' · '}
              Fee: <strong className="text-light">{feePct}%</strong>
              {' · '}
              Min: <strong className="text-light">${fmt(minWd)}</strong>
            </div>
            <div className="small mt-1 mb-0" style={{ color: '#aaa' }}>
              {capLine}
              {' · '}
              Days ({String(withdrawalPolicyMerged.withdrawalWindowTimezone ?? 'Etc/UTC')}):{' '}
              <strong className="text-light">
                {formatWithdrawalAllowedWeekdays(withdrawalPolicyMerged.withdrawalAllowedWeekdays)}
              </strong>
              {' — '}
              {withdrawDayAllowed ? (
                <span className="text-success">today OK</span>
              ) : (
                <span className="text-warning">not today</span>
              )}
            </div>
            <div className="small mt-1 mb-0" style={{ color: '#aaa' }}>
              Window ({String(withdrawalPolicyMerged.withdrawalWindowTimezone ?? 'Etc/UTC')}):{' '}
              <strong className="text-light">
                {String(withdrawalPolicyMerged.withdrawalWindowStart)} – {String(withdrawalPolicyMerged.withdrawalWindowEnd)}
              </strong>
              {' — '}
              {withdrawWindowOpen ? (
                <span className="text-success">open now</span>
              ) : (
                <span className="text-warning">closed now</span>
              )}
            </div>
            <p className="small mt-2 mb-0 text-secondary">{fmtNextAutoSummary(settings)}</p>
          </div>
        </div>
      </div>
      <div className="mt-2">
        <StatGrid items={row2} />
      </div>
      <div className="mt-2">
        <StatGrid items={row4} />
      </div>

      {campaignProgress?.campaign && (campaignProgress.tiers?.length ?? 0) > 0 ? (
        <section className="mt-4 mb-4 rounded-3 border border-secondary p-4" style={{ borderColor: 'rgba(212,175,55,0.2)' }}>
          <h3 className="mb-1" style={{ color: '#d4af37', fontWeight: 600 }}>
            {campaignProgress.campaign.title}
          </h3>
          {campaignProgress.campaign.subtitle ? (
            <p className="small mb-3" style={{ color: '#aaa' }}>
              {campaignProgress.campaign.subtitle}
            </p>
          ) : null}
          <p className="small mb-3" style={{ color: '#888' }}>
            Promo ends {new Date(campaignProgress.campaign.endAt).toLocaleString()}
          </p>
          {campaignProgress.tiers.map((tier) => {
            const bars = referralTierBarHud(tier)
            const barFill = tier.completed ? '#5cb85c' : '#d4af37'
            const barBg = tier.completed
              ? 'linear-gradient(90deg,#5cb85c,#3d8b3d)'
              : 'linear-gradient(90deg,#d4af37,#8b6914)'
            const ProgressRow = ({
              label,
              percent,
              right,
            }: {
              label: string
              percent: number
              right: string
            }) => (
              <div className="mb-2">
                <div className="d-flex flex-wrap justify-content-between gap-1 mb-1">
                  <span className="small" style={{ color: '#bbb' }}>
                    {label}
                  </span>
                  <span className="small" style={{ color: '#aaa' }}>
                    {right}
                  </span>
                </div>
                <div style={{ height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, percent))}%`,
                      height: '100%',
                      background: barBg,
                    }}
                  />
                </div>
              </div>
            )
            return (
              <div
                key={tier.tierId}
                className="mb-4 pb-3 border-bottom border-secondary"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                  <strong style={{ color: tier.completed ? barFill : '#f5f5f5' }}>
                    {tier.rewardSubtitle ? `${tier.rewardSubtitle} → ` : ''}
                    {tier.rewardLabel}
                    {tier.completed ? ' ✓' : ''}
                  </strong>
                  {!tier.completed ? (
                    <span className="small" style={{ color: '#aaa' }}>
                      {bars.overallPercent}% complete
                    </span>
                  ) : null}
                </div>
                {bars.showJoinBar ? (
                  <ProgressRow
                    label={
                      tier.minMemberPackageAmount != null && tier.minMemberPackageAmount > 0
                        ? `Join package ($${fmt(tier.minMemberPackageAmount)}+)`
                        : 'Active package'
                    }
                    percent={bars.joinPercent}
                    right={tier.memberJoinMet ? 'Done' : `${bars.joinPercent}%`}
                  />
                ) : null}
                <ProgressRow
                  label="Direct referrals (campaign window)"
                  percent={bars.directPercent}
                  right={`${tier.qualifyingDirectCount} / ${tier.requiredDirectReferrals}`}
                />
                <p className="small mb-0 mt-1" style={{ color: '#888' }}>
                  {tier.completed
                    ? 'Reward requirements completed.'
                    : tier.memberJoinMet
                      ? 'Package OK — invite more direct referrals who join in the promo period with an active package.'
                      : 'Complete your package and direct referral targets to unlock this reward.'}
                </p>
              </div>
            )
          })}
        </section>
      ) : null}

      {rankHud ? (
        <section className="mt-4 mb-5 rounded-3 border border-secondary p-4" style={{ borderColor: 'rgba(212,175,55,0.2)' }}>
          <h3 className="mb-2" style={{ color: '#d4af37', fontWeight: 600 }}>
            Rank progress
          </h3>
          <p className="small mb-2" style={{ color: '#aaa' }}>
            Qualification uses {rankHud.powerPct.toFixed(0)}% power / {rankHud.restPct.toFixed(0)}% rest of your team
            business target (from your activation snapshot when available).
          </p>
          {rankHud.dripLine ? (
            <p className="small mb-2 text-success" style={{ fontWeight: 600 }}>
              {rankHud.dripLine}
            </p>
          ) : null}
          <div className="mb-2" style={{ height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, rankHud.progressPct))}%`,
                height: '100%',
                background: 'linear-gradient(90deg,#d4af37,#8b6914)',
              }}
            />
          </div>
          <p className="small mb-0" style={{ color: '#ccc' }}>
            {rankHud.nextLine}
          </p>
        </section>
      ) : null}
    </main>
  )
}
