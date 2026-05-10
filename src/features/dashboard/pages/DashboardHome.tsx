import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { CopySimple, Link as LinkIcon } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
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

  const refLink = useMemo(() => {
    if (!profile?.username) return ''
    const base = referralBase()
    return `${base}/register?ref=${profile.username}`
  }, [profile?.username])

  useEffect(() => {
    if (!firebaseUid) {
      setActivePackageTotal(undefined)
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
        snap.forEach((doc) => {
          const d = doc.data()
          if (String(d.status ?? 'active').toLowerCase() === 'active') {
            sum += Number(d.amount ?? 0)
          }
        })
        setActivePackageTotal(sum)
      },
      () => {
        setActivePackageTotal(0)
        toast.error('Could not load active package total')
      },
    )
  }, [firebaseUid])

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

  type Stat = { label: string; value: string; tone: 'warning' | 'primary' | 'danger' | 'success' }
  const row1: Stat[] = [
    {
      label: 'Your Package (active)',
      value: activePackageTotal === undefined ? '$ …' : `$ ${fmt(activePackageTotal)}`,
      tone: 'warning',
    },
    { label: 'Cash Wallet', value: `$ ${fmt(profile.wallets.cash)}`, tone: 'primary' },
    { label: 'Activation Wallet', value: `$ ${fmt(profile.wallets.activation)}`, tone: 'danger' },
    { label: 'Deposit Wallet', value: `$ ${fmt(profile.wallets.deposit)}`, tone: 'danger' },
    { label: 'Total Withdrawal', value: `$ ${fmt(profile.totalWithdrawn)}`, tone: 'success' },
  ]

  const row2: Stat[] = [
    { label: 'Active Directs', value: String(profile.activeDirects), tone: 'primary' },
    { label: 'Sponsor Bonus', value: `$ ${fmt(profile.sponsorBonusTotal)}`, tone: 'danger' },
    { label: 'Daily Profits', value: `$ ${fmt(profile.dailyProfitsTotal)}`, tone: 'warning' },
    { label: 'Team Level Commission', value: `$ ${fmt(profile.teamLevelCommissionTotal)}`, tone: 'success' },
  ]

  const row3: Stat[] = [
    {
      label: 'Non Working Income Balance (2x)',
      value: `$ ${fmt(profile.nonWorkingIncomeBalance)}`,
      tone: 'primary',
    },
    {
      label: 'Working Income Balance (3x)',
      value: `$ ${fmt(profile.workingIncomeBalance)}`,
      tone: 'danger',
    },
  ]

  const row4: Stat[] = [
    { label: 'Total Team Business', value: `$ ${fmt(profile.totalTeamBusiness)}`, tone: 'primary' },
    { label: 'Rank', value: profile.currentRank, tone: 'danger' },
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
      <div className="mt-2">
        <StatGrid items={row2} />
      </div>
      <div className="mt-2">
        <StatGrid items={row3} />
      </div>
      <div className="mt-2 mb-5">
        <StatGrid items={row4} />
      </div>
    </main>
  )
}
