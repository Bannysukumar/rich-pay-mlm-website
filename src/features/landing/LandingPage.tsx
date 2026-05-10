import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { estimatedTotalRoiPercent, fmtUsdRange, usePublicPackages } from '@/hooks/usePublicPackages'
import { PublicNavbar } from './PublicNavbar'
import './landing.css'

const tickerPairs = [
  { pair: 'EUR/USD', price: '1.0842', pct: '+0.12%', up: true },
  { pair: 'GBP/USD', price: '1.2654', pct: '+0.08%', up: true },
  { pair: 'USD/JPY', price: '149.32', pct: '-0.05%', up: false },
  { pair: 'XAU/USD', price: '2154.20', pct: '+1.24%', up: true },
  { pair: 'BTC/USDT', price: '67,432.10', pct: '+2.45%', up: true },
]

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Hero uses mount animation so content is not gated on intersection (header is at top: 0). */
function HeroReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const TIER_BORDERS = ['var(--gold-2)', 'var(--gold-3)', 'var(--gold-4)', 'var(--gold-2)', '#ffde59']

export function LandingPage() {
  const { packages, loaded } = usePublicPackages()
  const tickerRow = [...tickerPairs, ...tickerPairs]

  return (
    <div className="landing-root">
      <div className="blob blob-1" aria-hidden />
      <div className="blob blob-2" aria-hidden />

      <PublicNavbar />

      <header className="hero hero-home" id="home">
        <div className="reveal-wrap">
          <HeroReveal>
            <h1>
              Trade the World&apos;s Markets <br />
              With <span className="text-gold">Institutional Precision</span>
            </h1>
          </HeroReveal>
          <HeroReveal delay={0.08}>
            <p className="hero-sub">
              Experience a high-liquidity global platform designed for Forex trading, daily income, and ultimate
              financial transparency.
            </p>
          </HeroReveal>
          <HeroReveal className="hero-btns" delay={0.16}>
            <Link to="/register" className="btn-gold">
              Get Started Now
            </Link>
            <Link to="/plans" className="btn-outline">
              Browse Plans
            </Link>
          </HeroReveal>
        </div>
      </header>

      <section
        className="market-ticker"
        style={{
          padding: '20px 0',
          background: 'rgba(212, 175, 55, 0.05)',
          borderTop: '1px solid var(--glass-border)',
          borderBottom: '1px solid var(--glass-border)',
          overflow: 'hidden',
        }}
      >
        <div className="market-ticker-inner">
          {tickerRow.map((t, i) => (
            <div key={`${t.pair}-${i}`} className="pair text-[0.95rem]">
              {t.pair}{' '}
              <span className="text-gold" style={{ WebkitTextFillColor: '#d4af37' }}>
                {t.price}
              </span>{' '}
              <small style={{ color: t.up ? '#4ade80' : '#f87171' }}>{t.pct}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="about relative py-[120px] px-[8%]">
        <Reveal className="text-center">
          <h2 className="section-title">
            Institutional <span className="text-gold">Grade Trading</span>
          </h2>
          <div className="glass mx-auto max-w-[1000px] rounded-[30px] p-[50px] max-md:p-8">
            <p className="mb-8 text-[1.2rem] leading-[1.8] text-[#ccc]">
              RichPay provides a bridge to global liquidity. By leveraging advanced trading infrastructure, we offer a
              secure ecosystem where your capital yields consistent returns through professional Forex operations.
            </p>
            <div className="grid grid-cols-1 gap-5 text-left md:grid-cols-3">
              <div className="text-[0.95rem] opacity-80">
                <span className="text-gold" style={{ WebkitTextFillColor: '#d4af37' }}>
                  ✔
                </span>{' '}
                Ultra-Low Spreads
              </div>
              <div className="text-[0.95rem] opacity-80">
                <span className="text-gold" style={{ WebkitTextFillColor: '#d4af37' }}>
                  ✔
                </span>{' '}
                Instant Execution
              </div>
              <div className="text-[0.95rem] opacity-80">
                <span className="text-gold" style={{ WebkitTextFillColor: '#d4af37' }}>
                  ✔
                </span>{' '}
                24/5 Global Access
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="how-it-works bg-black/20 px-[8%] py-[100px]">
        <Reveal>
          <h2 className="section-title">
            Three Steps To <span className="text-gold">Freedom</span>
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {[
            {
              title: '1. Quick Setup',
              body: 'Register your professional account in under 60 seconds with our streamlined process.',
              icon: (
                <>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="17" y1="11" x2="23" y2="11" />
                </>
              ),
            },
            {
              title: '2. Activate Plan',
              body: 'Choose from our meticulously crafted investment portfolios starting from just $100.',
              icon: (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </>
              ),
            },
            {
              title: '3. Harvest ROI',
              body: 'Monitor your daily growth in real-time and enjoy a consistent stream of passive income.',
              icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
            },
          ].map((s) => (
            <Reveal key={s.title}>
              <div className="landing-card p-8 text-center">
                <div className="icon-box">
                  <svg viewBox="0 0 24 24">{s.icon}</svg>
                </div>
                <h3 className="mb-3 text-xl font-semibold text-white">{s.title}</h3>
                <p className="text-[0.95rem] leading-relaxed text-[#aaa]">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="plans px-[8%] py-[120px]" id="plans">
        <Reveal>
          <h2 className="section-title">
            Investment <span className="text-gold">Tiers</span>
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {!loaded ? (
            <p className="py-12 text-center text-[#aaa]" style={{ gridColumn: '1 / -1' }}>
              Loading investment tiers…
            </p>
          ) : packages.length === 0 ? (
            <p className="py-12 text-center text-[#aaa]" style={{ gridColumn: '1 / -1' }}>
              Published packages will appear here after your administrator configures them.
            </p>
          ) : (
            packages.map((p, i) => (
              <Reveal key={p.id}>
                <div
                  className="landing-card p-6 text-center"
                  style={{
                    borderBottom: `3px solid ${TIER_BORDERS[i % TIER_BORDERS.length]}`,
                  }}
                >
                  <span className="text-[0.9rem] opacity-60">{p.name}</span>
                  <h3 className="my-2 text-[2rem] font-bold text-white">{fmtUsdRange(p.minAmount, p.maxAmount)}</h3>
                  <div
                    className="text-gold text-[1.5rem] font-semibold"
                    style={{ WebkitTextFillColor: '#d4af37' }}
                  >
                    {p.roiPercent}% Daily
                  </div>
                  <p className="mt-4 text-[0.95rem] text-[#aaa]">
                    {p.durationDays} Days <br /> Total ~{estimatedTotalRoiPercent(p)}%
                  </p>
                </div>
              </Reveal>
            ))
          )}
        </div>
        <Reveal className="mt-12 text-center">
          <Link to="/plans" className="btn-outline">
            View Comprehensive Reward Structure
          </Link>
        </Reveal>
      </section>

      <section
        className="income px-[8%] py-[100px]"
        style={{ background: 'rgba(212, 175, 55, 0.05)' }}
      >
        <Reveal>
          <h2 className="section-title">
            Passive &amp; <span className="text-gold">Active Income</span>
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              h: '5% Instant Sponsor',
              p: 'Receive immediate rewards for expanding our network through direct referrals.',
            },
            {
              h: '30 Level Team Profit',
              p: 'Unlock deep generational earnings as your community grows across 30 levels.',
            },
            {
              h: 'Target Rank Bonuses',
              p: 'Reach business milestones and unlock persistent daily bonus rewards.',
            },
          ].map((x) => (
            <Reveal key={x.h}>
              <div className="rounded-2xl p-[50px]" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <h4 className="text-gold mb-4 text-[1.5rem] font-semibold" style={{ WebkitTextFillColor: '#d4af37' }}>
                  {x.h}
                </h4>
                <p className="leading-relaxed text-[#bbb]">{x.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="cta px-[8%] py-[120px] text-center">
        <Reveal>
          <div className="cta-inner">
            <h2 className="mb-6 text-[clamp(1.75rem,4vw,3rem)] font-bold leading-tight text-white">
              Ready to Elevate Your <br />
              <span className="text-gold">Financial Status?</span>
            </h2>
            <p className="mb-10 text-[1.2rem] text-[#aaa]">
              Join the elite group of investors benefiting from RichPay today.
            </p>
            <Link to="/register" className="btn-gold text-[1.1rem] !px-[50px] !py-5">
              Initialize My Account
            </Link>
          </div>
        </Reveal>
      </section>

      <footer
        id="contact"
        className="border-t border-[var(--glass-border)] bg-[#050505] px-[8%] pb-8 pt-[100px]"
      >
        <div className="container mx-auto mb-[60px] grid grid-cols-1 gap-10 md:grid-cols-3">
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
            <p className="mt-6 text-[0.9rem] leading-relaxed text-[#666]">
              Empowering the next generation of global investors with transparent and scalable financial solutions.
            </p>
          </div>
          <div className="footer-links">
            <h4 className="text-gold mb-5 text-lg font-semibold" style={{ WebkitTextFillColor: '#d4af37' }}>
              Navigation
            </h4>
            <ul className="space-y-1 text-[#666] leading-8">
              <li>
                <Link to="/">Platform Home</Link>
              </li>
              <li>
                <Link to="/plans">Investment Plans</Link>
              </li>
              <li>
                <Link to="/contact">Support Center</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-gold mb-5 text-lg font-semibold" style={{ WebkitTextFillColor: '#d4af37' }}>
              Legal &amp; Security
            </h4>
            <p className="text-[0.85rem] leading-relaxed text-[#666]">
              RichPay operates with full compliance protocols. <br />
              <br />
              <strong className="text-[#888]">Risk Warning:</strong> Investment involves risk. Ensure you understand the
              system before committing capital.
            </p>
          </div>
        </div>
        <div className="border-t border-white/5 pt-8 text-center text-[0.85rem] text-[#444]">
          © {new Date().getFullYear()} RichPay International. Secure Asset Management.
        </div>
      </footer>
    </div>
  )
}
