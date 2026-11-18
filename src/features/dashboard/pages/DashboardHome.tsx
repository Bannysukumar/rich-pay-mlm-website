import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import { Link, useLocation } from 'react-router-dom'
import { CopySimple, Link as LinkIcon } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import {
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
import { ReferralCampaignBannerModal } from '@/components/dashboard/ReferralCampaignBannerModal'
import { referralTierBarHud } from '@/lib/referralCampaignProgress'
import {
  openReferralWhatsappShare,
  referralWhatsappImageUrl,
  referralWhatsappShareFromSettings,
} from '@/lib/referralShareMessage'
import { deriveIncomeCapHud, type ActiveStakeForCap } from '@/lib/incomeCapHud'
import {
  estimateRoi2xCompleteIstDay,
  formatRoi2xCompleteLabel,
  formatRoiOffWeekdaysShort,
  normalizeRoiOffDates,
  normalizeRoiOffWeekdays,
  ROI_JOB_TIME_LABEL_IST,
} from '@/lib/istCalendar'

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** Activations with immutable `planSnapshot` schema v2 (post–compensation-freeze flow). Legacy packages are excluded. */
function isNewSchemaPackage(planSnapshot: unknown): boolean {
  if (!planSnapshot || typeof planSnapshot !== 'object') return false
  return Number((planSnapshot as Record<string, unknown>).schemaVersion) === 2
}

type PkgIncomeRow = {
  id: string
  status: string
  /** True when this row counts toward "Active packages (total)" and live working-cap split. */
  liveActive: boolean
  amount: number
  nonWorkingPaid: number
  schemaV2: boolean
  nwMult: number
  wMult: number
  packageName: string
  startedAtMs: number
  /** Frozen daily ROI % from plan snapshot (e.g. 1). */
  roiPercent: number
  /** Referral/working income attributed to this earner package. */
  attributedWorkingIncome: number
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
  const location = useLocation()
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
        const siteW = Number(settings.workingIncomeCapMultiplier ?? 1)
        const siteNw = Number(settings.nonWorkingIncomeCapMultiplier ?? 2)
        snap.forEach((docSnap) => {
          const d = docSnap.data() as Record<string, unknown>
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
          const nwMult = Number(
            d.frozenNonWorkingCapMultiplier ??
              (ps != null && ps.nonWorkingIncomeCapMultiplier != null
                ? Number(ps.nonWorkingIncomeCapMultiplier)
                : siteNw),
          )
          const started = d.startedAt as { toMillis?: () => number } | number | undefined
          const startedAtMs =
            started && typeof (started as { toMillis?: () => number }).toMillis === 'function'
              ? (started as { toMillis: () => number }).toMillis()
              : Number(started ?? 0) || 0
          rows.push({
            id: docSnap.id,
            status,
            liveActive,
            amount: Number(d.amount ?? 0),
            nonWorkingPaid: Number(d.nonWorkingPaid ?? 0),
            schemaV2,
            nwMult: Number.isFinite(nwMult) && nwMult >= 0 ? nwMult : siteNw,
            wMult: Number.isFinite(wMult) && wMult >= 0 ? wMult : siteW,
            packageName: String(ps?.packageName ?? d.packageName ?? 'Package'),
            startedAtMs,
            roiPercent: Number(ps?.roiPercent != null ? ps.roiPercent : d.roiPercent ?? 0),
            attributedWorkingIncome: Number(d.attributedWorkingIncome ?? 0),
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

  const incomeCapHud = useMemo(() => {
    const stakes: ActiveStakeForCap[] = pkgIncomeRows.map((p) => ({
      liveActive: p.liveActive,
      amount: p.amount,
      nonWorkingPaid: p.nonWorkingPaid,
      nwMult: p.nwMult,
      wMult: p.wMult,
      packageName: p.packageName,
      startedAtMs: p.startedAtMs,
      attributedWorkingIncome: p.attributedWorkingIncome,
      id: p.id,
    }))
    const hasReferralPath =
      Number(profile?.activeDirects ?? 0) > 0 ||
      Number(profile?.sponsorBonusTotal ?? 0) > 0 ||
      Number(profile?.teamLevelCommissionTotal ?? 0) > 0 ||
      Number(profile?.rankCommissionTotal ?? 0) > 0 ||
      Number(profile?.totalWorkingIncome ?? 0) > 0
    return deriveIncomeCapHud(stakes, profile?.totalWorkingIncome ?? 0, { hasReferralPath })
  }, [
    pkgIncomeRows,
    profile?.totalWorkingIncome,
    profile?.activeDirects,
    profile?.sponsorBonusTotal,
    profile?.teamLevelCommissionTotal,
    profile?.rankCommissionTotal,
  ])

  const roiOffWeekdays = useMemo(
    () => normalizeRoiOffWeekdays(settings.roiOffWeekdays),
    [settings.roiOffWeekdays],
  )
  const roiOffDates = useMemo(
    () => normalizeRoiOffDates(settings.roiOffDates),
    [settings.roiOffDates],
  )
  const roiOffShort = useMemo(() => formatRoiOffWeekdaysShort(roiOffWeekdays), [roiOffWeekdays])

  /** Per-package lines so members see each investment separately (not only the combined total). */
  const perPackageCapRows = useMemo(() => {
    return pkgIncomeRows
      .filter((p) => p.liveActive)
      .slice()
      .sort((a, b) => a.startedAtMs - b.startedAtMs)
      .map((p, idx, arr) => {
        const amt = Math.max(0, p.amount)
        const roiCap = amt * Math.max(0, p.nwMult)
        const pkgCap = amt * (Math.max(0, p.nwMult) + Math.max(0, p.wMult))
        const roiPaid = Math.max(0, p.nonWorkingPaid)
        const roiLeft = Math.max(0, roiCap - roiPaid)
        const dailyPay = Math.round(((amt * Math.max(0, p.roiPercent)) / 100) * 100) / 100
        const completeDay = estimateRoi2xCompleteIstDay(roiLeft, dailyPay, roiOffWeekdays, roiOffDates)
        const startedLabel = p.startedAtMs
          ? new Date(p.startedAtMs).toLocaleDateString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '—'
        return {
          id: p.id,
          title: arr.length > 1 ? `Package ${idx + 1}` : p.packageName || 'Package',
          packageName: p.packageName,
          startedLabel,
          amount: amt,
          roiPaid,
          roiCap,
          roiLeft,
          dailyPay,
          pkgCap,
          roiPct: roiCap > 1e-9 ? Math.min(100, Math.round((roiPaid / roiCap) * 1000) / 10) : 0,
          twoXCompleteLabel:
            roiLeft <= 1e-9 ? '2× already reached' : formatRoi2xCompleteLabel(completeDay),
        }
      })
  }, [pkgIncomeRows, roiOffWeekdays, roiOffDates])

  const activePackagesSub =
    perPackageCapRows.length > 1
      ? perPackageCapRows.map((p) => `$ ${fmt(p.amount)}`).join(' + ')
      : undefined

  const showCampaignBanner = useMemo(() => {
    const c = campaignProgress?.campaign
    if (!c?.bannerEnabled) return false
    return Boolean(c.bannerImageUrl?.trim() || c.bannerMessage.trim())
  }, [campaignProgress])

  const [bannerPopupOpen, setBannerPopupOpen] = useState(false)

  useEffect(() => {
    if (location.pathname !== '/dashboard') return
    if (!showCampaignBanner || !campaignProgress?.campaign) return
    setBannerPopupOpen(true)
  }, [location.pathname, location.key, showCampaignBanner, campaignProgress?.campaign?.id])

  const closeCampaignBanner = () => {
    setBannerPopupOpen(false)
    window.setTimeout(() => {
      document.getElementById('referral-campaign-rewards')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
  }

  const showCampaignPopup = bannerPopupOpen && showCampaignBanner && campaignProgress?.campaign != null

  const copy = async () => {
    if (!refLink) return
    await navigator.clipboard.writeText(refLink)
    toast.success('Referral link copied')
  }

  const promoImageUrl = referralWhatsappImageUrl(settings)

  const shareOnWhatsApp = () => {
    if (!refLink) return
    const message = referralWhatsappShareFromSettings(settings, refLink)
    void openReferralWhatsappShare(message, promoImageUrl)
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

  type Stat = {
    label: string
    value: string
    tone: 'warning' | 'primary' | 'danger' | 'success'
    sub?: string
  }
  const row1: Stat[] = [
    {
      label:
        perPackageCapRows.length > 1
          ? `Active Packages (Total · ${perPackageCapRows.length} plans)`
          : 'Active Packages (Total)',
      value: activePackageTotal === undefined ? '$ …' : `$ ${fmt(activePackageTotal)}`,
      tone: 'warning',
      sub: activePackagesSub,
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
            <p className="mg-b-0 f-w-600 txt-ellipsis-1">{c.label}</p>
            {c.sub ? (
              <p className="small mb-0 mt-1 txt-ellipsis-2" style={{ color: '#aaa', fontWeight: 500 }}>
                {c.sub}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <main className="container-fluid py-4 px-3">
      {showCampaignPopup ? (
        <ReferralCampaignBannerModal
          campaign={campaignProgress!.campaign!}
          onDismiss={closeCampaignBanner}
        />
      ) : null}

      <div className="row mb-4">
        <div className="col-12">
          <h2 style={{ fontWeight: 700, color: '#d4af37' }}>Your Referral Hub</h2>
          <p style={{ color: '#aaa' }} className="mb-0">
            Share your unique link and earn {sponsorPct}% instant commission + {teamLevels}-level team rewards
          </p>
        </div>
      </div>

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
              {promoImageUrl ? (
                <div className="mb-4 text-center">
                  <img
                    src={promoImageUrl}
                    alt="Referral promo"
                    className="img-fluid rounded"
                    style={{ maxHeight: 220, objectFit: 'contain' }}
                  />
                  <p className="small mt-2 mb-0 text-secondary">Optional promo image — included on share when supported</p>
                </div>
              ) : null}
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

      <div className="row mt-3">
        <div className="col-12">
          <div
            className="card border-0"
            style={{
              background: 'linear-gradient(145deg, rgba(30,30,30,0.95), rgba(18,18,18,0.98))',
              border: '1px solid rgba(212,175,55,0.28)',
            }}
          >
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                <div>
                  <h4 className="mb-1" style={{ color: '#d4af37', fontWeight: 700 }}>
                    Your earnings
                  </h4>
                  <p className="small mb-0" style={{ color: '#aaa' }}>
                    Multiple packages allowed — each package earns <strong className="text-light">separately</strong>.
                  </p>
                </div>
                <div className="text-end">
                  <div className="fw-bold text-light" style={{ fontSize: '1.15rem' }}>
                    $ {fmt(incomeCapHud.totalPaid)}
                    <span style={{ color: '#888', fontWeight: 500 }}> / $ {fmt(incomeCapHud.totalCap)}</span>
                  </div>
                  <div className="small" style={{ color: '#888' }}>
                    earned / max · {incomeCapHud.maxLabel}
                  </div>
                </div>
              </div>

              <div
                className="progress mb-3"
                style={{ height: 8, background: 'rgba(255,255,255,0.08)' }}
                role="progressbar"
                aria-valuenow={incomeCapHud.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="progress-bar"
                  style={{
                    width: `${Math.min(100, incomeCapHud.progressPct)}%`,
                    background: incomeCapHud.allStopped ? '#c45c5c' : '#d4af37',
                  }}
                />
              </div>

              <div className="row g-3 mb-3">
                <div className={incomeCapHud.hasReferralPath ? 'col-sm-6' : 'col-12'}>
                  <div className="p-3 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="small mb-1" style={{ color: '#aaa' }}>
                      Daily profit left (2×)
                    </div>
                    <div className="fw-semibold text-light" style={{ fontSize: '1.1rem' }}>
                      $ {fmt(incomeCapHud.roiRemaining)}
                    </div>
                    <div className="small mt-1" style={{ color: '#888' }}>
                      of $ {fmt(incomeCapHud.roiCap)} daily max across all packages
                    </div>
                  </div>
                </div>
                {incomeCapHud.hasReferralPath ? (
                  <div className="col-sm-6">
                    <div className="p-3 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="small mb-1" style={{ color: '#aaa' }}>
                        Referral left on first package (1×)
                      </div>
                      <div className="fw-semibold text-light" style={{ fontSize: '1.1rem' }}>
                        $ {fmt(incomeCapHud.referralExtraRemaining)}
                      </div>
                      <div className="small mt-1" style={{ color: '#888' }}>
                        {incomeCapHud.firstPackageLabel} · $ {fmt(incomeCapHud.firstPackageAmount)} · up
                        to $ {fmt(incomeCapHud.workingSoftCap)}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {perPackageCapRows.length > 0 ? (
                <div className="mb-3">
                  <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2">
                    <div>
                      <div className="small mb-1" style={{ color: '#aaa', fontWeight: 600 }}>
                        Daily ROI ({roiOffShort})
                      </div>
                      <div className="small" style={{ color: '#ccc' }}>
                        Total: earned <strong className="text-light">$ {fmt(incomeCapHud.roiPaid)}</strong>
                        {' · '}
                        remaining <strong className="text-light">$ {fmt(Math.max(0, incomeCapHud.roiCap - incomeCapHud.roiPaid))}</strong>
                        {' · '}
                        max 2× <strong className="text-light">$ {fmt(incomeCapHud.roiCap)}</strong>
                      </div>
                    </div>
                    <div className="small" style={{ color: '#888' }}>
                      Pays {ROI_JOB_TIME_LABEL_IST} · Mon–Fri
                    </div>
                  </div>
                  <div className="row g-2">
                    {perPackageCapRows.map((pkg) => (
                      <div key={pkg.id} className="col-12">
                        <div
                          className="p-3 rounded"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(212,175,55,0.18)',
                          }}
                        >
                          <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                            <div>
                              <strong className="text-light d-block">
                                {pkg.packageName || pkg.title} · $ {fmt(pkg.amount)}
                              </strong>
                              <span className="small" style={{ color: '#888' }}>
                                Started {pkg.startedLabel}
                              </span>
                            </div>
                            <div className="text-end small">
                              <div style={{ color: '#d4af37', fontWeight: 600 }}>2× complete</div>
                              <div style={{ color: pkg.roiLeft > 0 ? '#8dcea0' : '#e8a0a0' }}>
                                {pkg.twoXCompleteLabel}
                              </div>
                            </div>
                          </div>
                          <div
                            className="progress mb-2"
                            style={{ height: 6, background: 'rgba(255,255,255,0.08)' }}
                            role="progressbar"
                            aria-valuenow={pkg.roiPct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="progress-bar"
                              style={{
                                width: `${Math.min(100, pkg.roiPct)}%`,
                                background: pkg.roiLeft > 0 ? '#d4af37' : '#c45c5c',
                              }}
                            />
                          </div>
                          <div className="d-flex flex-wrap justify-content-between gap-2 small">
                            <span style={{ color: '#ccc' }}>
                              Earned $ {fmt(pkg.roiPaid)} / $ {fmt(pkg.roiCap)} (2×)
                            </span>
                            <span style={{ color: pkg.roiLeft > 0 ? '#8dcea0' : '#e8a0a0', fontWeight: 600 }}>
                              $ {fmt(pkg.roiLeft)} remaining
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!incomeCapHud.hasReferralPath ? (
                    <p className="small mt-2 mb-0" style={{ color: '#888' }}>
                      No referral income yet — each package shows daily 2× only. Referral income will count on your
                      oldest package only.
                    </p>
                  ) : (
                    <p className="small mt-2 mb-0" style={{ color: '#888' }}>
                      Referral counts only on your oldest active package. When that package’s 3× is full it closes;
                      other packages keep daily ROI to their own 2×.
                    </p>
                  )}
                </div>
              ) : null}

              <div
                className="rounded p-3"
                style={{
                  background: incomeCapHud.allStopped ? 'rgba(196,92,92,0.12)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="fw-semibold mb-1" style={{ color: '#f0e6c8' }}>
                  {incomeCapHud.statusTitle}
                </div>
                <p className="small mb-0" style={{ color: '#bbb' }}>
                  {incomeCapHud.statusDetail}
                </p>
              </div>
            </div>
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

      {campaignProgress?.campaign ? (
        <section
          id="referral-campaign-rewards"
          className="mt-4 mb-4 rounded-3 border border-secondary p-4 scroll-margin-top"
          style={{ borderColor: 'rgba(212,175,55,0.2)', scrollMarginTop: '5rem' }}
        >
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
          {(campaignProgress.tiers?.length ?? 0) > 0 ? (
            campaignProgress.tiers.map((tier) => {
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
          })
          ) : (
            <p className="small mb-0 text-secondary">Reward tiers will appear here when configured by admin.</p>
          )}
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
