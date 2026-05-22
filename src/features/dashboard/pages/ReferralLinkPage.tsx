import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChartLine,
  ChartLineUp,
  CopySimple,
  GraduationCap,
  HandCoins,
  Link as LinkIcon,
  ShareNetwork,
  UserPlus,
} from '@phosphor-icons/react'
import { FaWhatsapp } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import {
  openReferralWhatsappShare,
  referralWhatsappImageUrl,
  referralWhatsappShareFromSettings,
} from '@/lib/referralShareMessage'

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export function ReferralLinkPage() {
  const { profile } = useAuthState()
  const { settings } = useSiteSettings()
  const [copyFlash, setCopyFlash] = useState(false)

  const refLink = useMemo(() => {
    if (!profile?.username) return ''
    return `${referralBase()}/register?ref=${profile.username}`
  }, [profile?.username])

  const copy = async () => {
    if (!refLink) return
    await navigator.clipboard.writeText(refLink)
    toast.success('Referral link copied — share it with your network to start earning.')
    setCopyFlash(true)
    window.setTimeout(() => setCopyFlash(false), 2000)
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
        <div className="alert alert-secondary border border-secondary">Loading…</div>
      </div>
    )
  }

  const sponsorPct = settings.sponsorPercent
  const teamLevels = settings.teamLevelsCount

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

      <div className="row g-4 align-items-stretch">
        <div className="col-lg-8 col-xl-8">
          <div className="referral-card h-100">
            <div className="referral-header">
              <h4 className="d-flex align-items-center gap-2 flex-wrap m-0">
                <LinkIcon size={28} weight="bold" /> Your Personal Referral Link
              </h4>
              <p className="mb-0 mt-2 small">Share this link with friends & family to start earning</p>
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
                </div>
              ) : null}
              <div className="referral-link-box mb-4">
                <CopySimple className="me-2" size={20} color="#d4af37" style={{ verticalAlign: 'middle' }} />
                <Link to={refLink} target="_blank" rel="noreferrer" className="d-inline">
                  {refLink}
                </Link>
              </div>

              <div className="row g-3 action-buttons mb-4">
                <div className="col-md-6">
                  <button
                    type="button"
                    className="btn-copy-ki d-inline-flex align-items-center justify-content-center gap-2"
                    onClick={() => void copy()}
                  >
                    <CopySimple size={20} weight="bold" />
                    {copyFlash ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
                <div className="col-md-6">
                  <button type="button" className="btn-whatsapp-ki d-inline-flex align-items-center justify-content-center gap-2" onClick={shareOnWhatsApp}>
                    <FaWhatsapp size={22} />
                    Share on WhatsApp
                  </button>
                </div>
              </div>

              <div className="stats-mini">
                <div className="row text-center">
                  <div className="col-4 stat-item">
                    <div className="stat-number">{sponsorPct}%</div>
                    <small style={{ color: '#aaa' }}>Direct Sponsor</small>
                  </div>
                  <div className="col-4 stat-item">
                    <div className="stat-number">{teamLevels}</div>
                    <small style={{ color: '#aaa' }}>Team Levels</small>
                  </div>
                  <div className="col-4 stat-item">
                    <div className="stat-number">$1k/Day</div>
                    <small style={{ color: '#aaa' }}>Rank Bonus</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4 col-xl-4">
          <div className="referral-card h-100 d-flex flex-column">
            <div className="referral-header ki-referral-quick-header py-3">
              <h4 className="d-flex align-items-center gap-2 m-0 text-light">
                <ChartLine size={26} weight="bold" /> Quick Stats
              </h4>
            </div>
            <div className="referral-body text-center flex-grow-1 d-flex flex-column">
              <div className="ki-qr-placeholder mb-3 mx-auto">
                <ShareNetwork size={56} weight="duotone" color="#d4af37" />
                <p className="mb-0 mt-2 small text-secondary">Share & Earn Instantly</p>
              </div>
              <div className="mt-2">
                <h5 style={{ color: '#d4af37' }} className="fs-6 fw-semibold">
                  Your Referral Earnings
                </h5>
                <div className="stat-number" id="referralEarnings">
                  ${fmt(profile.sponsorBonusTotal)}
                </div>
                <small style={{ color: '#aaa' }}>Lifetime commission</small>
              </div>
              <hr className="border-secondary border-opacity-25 my-4" />
              <div>
                <h5 style={{ color: '#d4af37' }} className="fs-6 fw-semibold">
                  Active Referrals
                </h5>
                <div className="stat-number" id="activeReferrals">
                  {profile.activeDirects}
                </div>
                <small style={{ color: '#aaa' }}>Directs</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-12">
          <div className="referral-card">
            <div className="referral-header ki-referral-how-header">
              <h4 className="d-flex align-items-center gap-2 flex-wrap m-0">
                <GraduationCap size={28} weight="bold" /> How Your Referral Income Works
              </h4>
            </div>
            <div className="referral-body">
              <div className="row">
                <div className="col-md-4 text-center mb-3 mb-md-0">
                  <UserPlus size={40} weight="duotone" color="#d4af37" className="d-block mx-auto" />
                  <h6 className="mt-3 mb-1" style={{ color: '#d4af37' }}>
                    1. Share Link
                  </h6>
                  <small style={{ color: '#aaa' }}>Share your unique referral link</small>
                </div>
                <div className="col-md-4 text-center mb-3 mb-md-0">
                  <HandCoins size={40} weight="duotone" color="#d4af37" className="d-block mx-auto" />
                  <h6 className="mt-3 mb-1" style={{ color: '#d4af37' }}>
                    2. Friend Invests
                  </h6>
                  <small style={{ color: '#aaa' }}>They activate any investment plan</small>
                </div>
                <div className="col-md-4 text-center">
                  <ChartLineUp size={40} weight="duotone" color="#d4af37" className="d-block mx-auto" />
                  <h6 className="mt-3 mb-1" style={{ color: '#d4af37' }}>
                    3. You Earn Instantly
                  </h6>
                  <small style={{ color: '#aaa' }}>
                    {sponsorPct}% direct + multi-level commissions
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
