import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
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

const plans = [
  { name: 'Starter Plan', roi: '1%', price: '$100', duration: '200 Days', returnLabel: 'Total Return: 200%', extraClass: '' },
  {
    name: 'Bronze Plan',
    roi: '2%',
    price: '$200',
    duration: '100 Days',
    returnLabel: 'Total Return: 200%',
    extraClass: 'plans-card-accent',
  },
  { name: 'Silver Plan', roi: '3%', price: '$300', duration: '66 Days', returnLabel: 'Total Return: 200%', extraClass: '' },
  { name: 'Gold Plan', roi: '4%', price: '$400', duration: '50 Days', returnLabel: 'Total Return: 200%', extraClass: '' },
  {
    name: 'Platinum Plan',
    roi: '5%',
    price: '$500',
    duration: '40 Days',
    returnLabel: 'Total Return: 200%',
    extraClass: 'plans-card-platinum',
  },
]

/** Matches reference layout: alternating L / R on the vertical gold line */
const timeline = [
  { title: 'Level 1: 10%', desc: 'Condition: Direct referrals' },
  { title: 'Level 2: 5%', desc: 'Condition: 2+ active directs' },
  { title: 'Level 3: 3%', desc: 'Condition: Growing team volume' },
  { title: 'Level 4: 2%', desc: 'Condition: Qualified structure' },
  { title: 'Level 5: 1%', desc: 'Condition: Rank progression' },
  { title: 'Level 6: 0.5%', desc: 'Condition: Sustained performance' },
  { title: 'Level 7–9: 0.5%', desc: 'Deep network rewards' },
  { title: 'Level 10–15: 0.25%', desc: 'Maximum depth bonus band' },
]

const ranks = [
  {
    title: 'Rank 1',
    target: '$5,000',
    reward: '$100 for 10 days',
    icon: (
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    ),
    extra: '',
  },
  {
    title: 'Rank 2',
    target: '$20,000',
    reward: '$250 for 15 days',
    icon: (
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </>
    ),
    extra: '',
  },
  {
    title: 'Rank 3',
    target: '$50,000',
    reward: '$500 for 30 days',
    icon: (
      <>
        <circle cx="12" cy="8" r="7" />
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </>
    ),
    extra: '',
  },
  {
    title: 'Rank 4',
    target: '$100,000',
    reward: '$1,000 for 45 days',
    icon: (
      <>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55.47.98.97 1.21C12.23 18.78 13.77 18.78 15 18.21c.5-.23.97-.66.97-1.21v-2.34" />
        <path d="M10 14.66C8.28 14.12 7 12.55 7 10.7V9h10v1.7c0 1.85-1.28 3.42-3 3.96" />
      </>
    ),
    extra: 'milestone-featured',
  },
]

export function InvestmentPlansPage() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Investment Plans & Earnings | RichPay'
    return () => {
      document.title = prev
    }
  }, [])

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
        <div className="plans-grid plans-grid-five">
          {plans.map((p) => (
            <Reveal key={p.name}>
              <div className={`card glass plans-plan-card text-center ${p.extraClass}`}>
                <span className="plans-tier-label">{p.name}</span>
                <div className="roi-large plans-roi-white">{p.roi}</div>
                <h3 className="plans-tier-price">{p.price}</h3>
                <p className="plans-tier-meta">Duration: {p.duration}</p>
                <p className="plans-tier-return">{p.returnLabel}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="sponsor-income lp-container sponsor-section-pad">
        <Reveal>
          <div className="glass sponsor-glass sponsor-panel relative overflow-hidden text-center">
            <div className="sponsor-blob blob" aria-hidden />
            <h2 className="section-title plans-styled-title sponsor-title-tight">
              Direct <span className="text-gold">Sponsor Income</span>
            </h2>
            <div className="sponsor-pct pulse">5%</div>
            <p className="sponsor-copy">
              Earn instant income on every direct referral investment. When your network grows, your rewards scale
              immediately.
            </p>
            <div className="sponsor-example-pill glass">Example: Earn $500 + Get More Weekly</div>
          </div>
        </Reveal>
      </section>

      <section className="team-income team-section-bg">
        <div className="lp-container">
          <Reveal>
            <h2 className="section-title plans-styled-title">
              Team Level <span className="text-gold">Growth Path</span>
            </h2>
          </Reveal>
          <p className="team-section-lead">Earn deep generational commissions across every qualified level.</p>

          <div className="timeline">
            {timeline.map((t) => (
              <Reveal key={t.title}>
                <div className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content glass timeline-card">
                    <h3 className="timeline-heading">{t.title}</h3>
                    <p className="timeline-desc">{t.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="rank-rewards lp-container rank-section-pad">
        <Reveal>
          <h2 className="section-title plans-styled-title">
            Rank Achievement <span className="text-gold">Milestones</span>
          </h2>
        </Reveal>
        <div className="roadmap">
          {ranks.map((r) => (
            <Reveal key={r.title}>
              <div className={`milestone glass milestone-card ${r.extra}`}>
                <div className={`rank-badge ${r.extra ? 'rank-badge-lg' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {r.icon}
                  </svg>
                </div>
                <h4 className="milestone-rank-title">{r.title}</h4>
                <p className="milestone-target">Target: {r.target}</p>
                <p className="milestone-reward">
                  Reward: <span className="text-gold font-semibold">{r.reward}</span>
                </p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="rank-footnote">…And higher tiers up to Rank 7 ($1,000/Day)</p>
      </section>

      <section className="rules lp-container rules-section-pad">
        <Reveal>
          <h2 className="section-title plans-styled-title">
            Platform <span className="text-gold">Guidelines</span>
          </h2>
        </Reveal>
        <div className="guidelines-grid">
          {[
            {
              h: 'Withdrawal Process',
              p: (
                <>
                  Minimum withdrawal: $10
                  <br />
                  Withdrawal fee: 10%
                </>
              ),
            },
            {
              h: 'Earning Caps',
              p: 'Maximum earning is capped at 2× your active investment.',
            },
            {
              h: 'Daily ROI',
              p: 'ROI is credited to your wallet balance daily at market close.',
            },
          ].map((x) => (
            <Reveal key={x.h}>
              <div className="card glass guideline-card">
                <h4 className="guideline-card-title">{x.h}</h4>
                <p className="guideline-card-body">{x.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

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
