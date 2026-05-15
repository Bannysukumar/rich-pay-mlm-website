import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { estimatedTotalRoiPercent, fmtUsdRange, usePublicPackages } from '@/hooks/usePublicPackages'
import { usePublicRanks, type PublicRankRow } from '@/hooks/usePublicRanks'
import { usePublicTeamLevels } from '@/hooks/usePublicTeamLevels'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { PublicNavbar } from './PublicNavbar'
import './landing.css'

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const PLAN_CARD_VARIANTS = ['', 'plans-card-accent', '', 'plans-card-platinum', ''] as const

function teamLevelSubtitle(row: { requiredDirects: number; uplineDurationCapPercent: number }): string {
  const d = row.requiredDirects
  const cap = row.uplineDurationCapPercent
  const capPart =
    Number.isFinite(cap) && cap < 100
      ? ` · upline share window: ${cap}% of downline plan length (days)`
      : ''
  if (Number.isFinite(d) && d > 0) {
    return `${d} active direct referral${d === 1 ? '' : 's'}${capPart}`
  }
  if (capPart) return capPart.replace(/^ · /, '')
  return 'As published in admin team matrix'
}

function RankBadgeGraphic({ rank }: { rank: PublicRankRow }) {
  const url = rank.iconUrl?.trim()
  if (url && /^https?:\/\/.+/i.test(url)) {
    return (
      <img
        src={url}
        alt=""
        className="mx-auto h-14 w-14 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function InvestmentPlansPage() {
  const { packages, loaded: pkLoaded } = usePublicPackages()
  const { teamLevels, loaded: tlLoaded } = usePublicTeamLevels()
  const { ranks, loaded: rkLoaded } = usePublicRanks()
  const { settings, loaded: siteLoaded } = useSiteSettings()
  const cur = settings.currencyLabel ?? 'USDT'

  useEffect(() => {
    const prev = document.title
    document.title = 'Investment Plans & Earnings | RichPay'
    return () => {
      document.title = prev
    }
  }, [])

  const maxRoiMult = useMemo(() => {
    if (!packages.length) return null
    return Math.max(1, ...packages.map((p) => p.maxRoiMultiplier))
  }, [packages])

  const guidelineCards = useMemo(() => {
    const items: { h: string; p: ReactNode }[] = [
      {
        h: 'Withdrawals',
        p: (
          <>
            Minimum withdrawal: {settings.minWithdrawal} {cur}
            <br />
            Withdrawal fee: {settings.withdrawFeePercent}%
          </>
        ),
      },
      {
        h: 'Deposits',
        p: (
          <>
            Minimum deposit: {settings.minDeposit} {cur}
          </>
        ),
      },
    ]
    if (pkLoaded && packages.length > 0 && maxRoiMult != null) {
      items.push({
        h: 'Return caps',
        p: `Published packages use non-working / return multipliers up to ${maxRoiMult}× (set per package in admin).`,
      })
    }
    const roiOff = settings.roiEnabled === false
    items.push({
      h: 'Daily ROI',
      p: roiOff
        ? 'Daily accruals are currently disabled by the administrator.'
        : `Accruals follow platform rules when enabled · credited daily at 12:00 AM IST (Asia/Kolkata).`,
    })
    if (settings.publicPlansGuidelineExtra?.trim()) {
      items.push({
        h: 'Additional notes',
        p: <span className="whitespace-pre-line">{settings.publicPlansGuidelineExtra.trim()}</span>,
      })
    }
    return items
  }, [
    cur,
    maxRoiMult,
    packages.length,
    pkLoaded,
    settings.minDeposit,
    settings.minWithdrawal,
    settings.publicPlansGuidelineExtra,
    settings.roiEnabled,
    settings.withdrawFeePercent,
  ])

  return (
    <div className="landing-root plans-page-shell">
      <div className="blob blob-1" aria-hidden />
      <div className="blob blob-2" aria-hidden />

      <PublicNavbar registerCta="Join Now" />

      <header className="hero hero-plans">
        <div className="reveal-wrap plans-hero-inner">
          <Reveal>
            <h1>
              Investment Plans &amp; <span className="text-gold">Earnings</span>
            </h1>
          </Reveal>
          <Reveal>
            <p className="plans-hero-sub">
              Choose your plan and explore multiple institutional income streams designed for consistent growth.
            </p>
          </Reveal>
        </div>
      </header>

      <section className="plans-section lp-container plans-section-pad">
        <Reveal>
          <h2 className="section-title plans-styled-title">
            Select Your <span className="text-gold">Tier</span>
          </h2>
        </Reveal>
        <div className="plans-grid">
          {!pkLoaded ? (
            <Reveal>
              <p className="text-center text-[#aaa]" style={{ gridColumn: '1 / -1' }}>
                Loading packages…
              </p>
            </Reveal>
          ) : packages.length === 0 ? (
            <Reveal>
              <p className="text-center text-[#aaa]" style={{ gridColumn: '1 / -1' }}>
                No investment packages are published yet. Please check back soon or contact support.
              </p>
            </Reveal>
          ) : (
            packages.map((p, i) => {
              const roi = p.roiPercent
              const totalPct = estimatedTotalRoiPercent(p)
              const variant = PLAN_CARD_VARIANTS[i % PLAN_CARD_VARIANTS.length]
              return (
                <Reveal key={p.id}>
                  <div className={`card glass plans-plan-card text-center ${variant}`}>
                    <span className="plans-tier-label">{p.name}</span>
                    <div className="roi-large plans-roi-white">{roi}% Daily</div>
                    <h3 className="plans-tier-price">{fmtUsdRange(p.minAmount, p.maxAmount)}</h3>
                    <p className="plans-tier-meta">Duration: {p.durationDays} Days</p>
                    <p className="plans-tier-return">Total ~{totalPct}%</p>
                  </div>
                </Reveal>
              )
            })
          )}
        </div>
      </section>

      {!siteLoaded ? null : (
        <section className="sponsor-income lp-container sponsor-section-pad">
          <Reveal>
            <div className="glass sponsor-glass sponsor-panel relative overflow-hidden text-center">
              <div className="sponsor-blob blob" aria-hidden />
              <h2 className="section-title plans-styled-title sponsor-title-tight">
                Direct <span className="text-gold">Sponsor Income</span>
              </h2>
              <div className="sponsor-pct pulse">{settings.sponsorPercent}%</div>
              {settings.publicPlansSponsorBody?.trim() ? (
                <p className="sponsor-copy whitespace-pre-line">{settings.publicPlansSponsorBody.trim()}</p>
              ) : (
                <p className="sponsor-copy text-[#cfcfcf]">
                  Sponsor rate and team-depth limits are configured in admin (current sponsor bonus:{' '}
                  {settings.sponsorPercent}% · up to {settings.teamLevelsCount} team levels).
                </p>
              )}
              {settings.publicPlansSponsorPill?.trim() ? (
                <div className="sponsor-example-pill glass">{settings.publicPlansSponsorPill.trim()}</div>
              ) : null}
            </div>
          </Reveal>
        </section>
      )}

      {tlLoaded && teamLevels.length > 0 ? (
        <section className="team-income team-section-bg">
          <div className="lp-container">
            <Reveal>
              <h2 className="section-title plans-styled-title">
                Team Level <span className="text-gold">Growth Path</span>
              </h2>
            </Reveal>
            {settings.publicPlansTeamLead?.trim() ? (
              <p className="team-section-lead whitespace-pre-line">{settings.publicPlansTeamLead.trim()}</p>
            ) : null}

            <div className="timeline">
              {teamLevels.map((t) => (
                <Reveal key={t.id}>
                  <div className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-content glass timeline-card">
                      <h3 className="timeline-heading">
                        Level {t.level}: {t.percent}%
                      </h3>
                      <p className="timeline-desc">{teamLevelSubtitle(t)}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : tlLoaded ? null : (
        <section className="team-income team-section-bg">
          <div className="lp-container py-12 text-center text-[#888]">
            Loading team rewards…
          </div>
        </section>
      )}

      {rkLoaded && ranks.length > 0 ? (
        <section className="rank-rewards lp-container rank-section-pad">
          <Reveal>
            <h2 className="section-title plans-styled-title">
              Rank Achievement <span className="text-gold">Milestones</span>
            </h2>
          </Reveal>
          <div className="roadmap">
            {ranks.map((r, i) => (
              <Reveal key={r.id}>
                <div
                  className={`milestone glass milestone-card ${
                    i === ranks.length - 1 && ranks.length >= 2 ? 'milestone-featured' : ''
                  }`}
                >
                  <div className={`rank-badge ${i === ranks.length - 1 && ranks.length >= 2 ? 'rank-badge-lg' : ''}`}>
                    <RankBadgeGraphic rank={r} />
                  </div>
                  <h4 className="milestone-rank-title">{r.name}</h4>
                  <p className="milestone-target">
                    Target team business: {new Intl.NumberFormat(undefined).format(r.requiredTeamBusiness)} {cur}
                  </p>
                  <p className="milestone-reward">
                    Reward:{' '}
                    <span className="text-gold font-semibold">
                      {new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.dailyReward)}{' '}
                      {cur}/day · {r.rewardDurationDays} days
                    </span>
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          {settings.publicPlansRankFootnote?.trim() ? (
            <p className="rank-footnote whitespace-pre-line">{settings.publicPlansRankFootnote.trim()}</p>
          ) : null}
        </section>
      ) : rkLoaded ? null : (
        <section className="rank-rewards lp-container rank-section-pad py-12 text-center text-[#888]">
          Loading rank milestones…
        </section>
      )}

      {!siteLoaded ? null : (
        <section className="rules lp-container rules-section-pad">
          <Reveal>
            <h2 className="section-title plans-styled-title">
              Platform <span className="text-gold">Guidelines</span>
            </h2>
          </Reveal>
          <div className="guidelines-grid">
            {guidelineCards.map((x) => (
              <Reveal key={x.h}>
                <div className="card glass guideline-card">
                  <h4 className="guideline-card-title">{x.h}</h4>
                  <p className="guideline-card-body">{x.p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="cta plans-cta-section text-center">
        <Reveal>
          <div className="cta-inner plans-cta-inner">
            <h2 className="plans-cta-heading">
              Ready to Start Your <br />
              <span className="text-gold">Earning Journey?</span>
            </h2>
            <Link to="/register" className="btn-gold pulse plans-cta-btn">
              Initiate My Account
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="plans-footer">
        <div className="lp-container plans-footer-grid">
          <div>
            <Link to="/" className="logo inline-block">
              <img
                src="/assets/images/richpay_logo.png"
                alt="RichPay Logo"
                className="h-10"
                onError={(e) => {
                  e.currentTarget.src = '/assets/images/richpay_logo.svg'
                }}
              />
            </Link>
            <p className="plans-footer-about">
              Building the future of digital asset growth through innovation and security.
            </p>
          </div>
          <div className="footer-links">
            <h4 className="plans-footer-col-title">Navigation</h4>
            <ul className="plans-footer-list">
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/plans">Investment Plans</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="plans-footer-col-title">Legal</h4>
            <p className="plans-footer-legal">
              <strong>Risk Warning:</strong> Trading involves risk. Ensure you understand the system before committing
              capital.
            </p>
          </div>
        </div>
        <div className="plans-footer-copy">© {new Date().getFullYear()} RichPay International. Secure Asset Management.</div>
      </footer>
    </div>
  )
}
