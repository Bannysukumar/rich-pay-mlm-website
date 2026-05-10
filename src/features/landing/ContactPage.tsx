import type { FormEvent, ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatTelegramLabel, telegramChannelHref } from '@/lib/contactDisplay'
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

type ContactCard = {
  key: string
  icon: ReactNode
  title: string
  body: ReactNode
}

export function ContactPage() {
  const { settings, loaded } = useSiteSettings()

  useEffect(() => {
    document.title = 'Contact Us | RichPay Institutional Support'
  }, [])

  const cards = useMemo(() => {
    const list: ContactCard[] = []
    const email = settings.supportEmail?.trim()
    const telegramRaw = settings.socialTelegram?.trim()
    const response = settings.publicContactResponseTime?.trim()

    if (email) {
      list.push({
        key: 'email',
        icon: (
          <>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </>
        ),
        title: 'Email Support',
        body: (
          <a href={`mailto:${email}`} className="contact-channel-link contact-card-meta">
            {email}
          </a>
        ),
      })
    }

    if (telegramRaw) {
      const label = formatTelegramLabel(telegramRaw)
      const href = telegramChannelHref(telegramRaw)
      list.push({
        key: 'telegram',
        icon: (
          <path d="M21.19 7L12 11.6L2.81 7M12 11.6V21M21.19 7L12 2.4L2.81 7M21.19 7V17L12 21.6M2.81 7V17L12 21.6" />
        ),
        title: 'Telegram Hub',
        body:
          href === '#' ? (
            <span className="contact-card-meta">{label}</span>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="contact-channel-link contact-card-meta"
            >
              {label}
            </a>
          ),
      })
    }

    if (response) {
      list.push({
        key: 'response',
        icon: (
          <>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </>
        ),
        title: 'Response Time',
        body: <span className="contact-card-meta whitespace-pre-line">{response}</span>,
      })
    }

    return list
  }, [
    settings.publicContactResponseTime,
    settings.socialTelegram,
    settings.supportEmail,
  ])

  const heroSub =
    settings.publicContactHeroSub?.trim() ||
    'Reach our team using the official channels configured for this platform.'
  const footerNote = settings.publicContactFooterNote?.trim()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const rt = settings.publicContactResponseTime?.trim()
    toast.success(
      rt
        ? `Message received. Target response window: ${rt}`
        : 'Message received — our team will reply as soon as possible.',
    )
    e.currentTarget.reset()
  }

  return (
    <div className="landing-root plans-page-shell contact-page-shell">
      <div className="blob blob-1" aria-hidden />
      <div className="blob blob-2" aria-hidden />

      <PublicNavbar registerCta="REGISTER" />

      <header className="hero hero-contact">
        <div className="contact-hero-inner">
          <Reveal>
            <h1>
              Institutional <span className="text-gold">Support</span>
            </h1>
          </Reveal>
          <Reveal>
            <p className="contact-hero-sub whitespace-pre-line">{heroSub}</p>
          </Reveal>
        </div>
      </header>

      <section className="lp-container contact-cards-section">
        <div className="contact-grid-adaptive">
          {!loaded ? (
            <Reveal>
              <p className="contact-card-meta text-center opacity-80">Loading support channels…</p>
            </Reveal>
          ) : cards.length === 0 ? (
            <Reveal>
              <p className="contact-card-meta text-center opacity-80">
                No public support channels yet. An administrator can add support email, Telegram, and response time in
                site configuration.
              </p>
            </Reveal>
          ) : (
            cards.map((c) => (
              <Reveal key={c.key}>
                <div className="card glass text-center contact-info-card">
                  <div className="contact-rank-badge" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {c.icon}
                    </svg>
                  </div>
                  <h3 className="text-gold">{c.title}</h3>
                  {c.body}
                </div>
              </Reveal>
            ))
          )}
        </div>
      </section>

      <section className="lp-container contact-form-section">
        <Reveal>
          <div className="contact-form-card">
            <h2 className="contact-form-title">
              Send a <span className="contact-form-title-accent">Message</span>
            </h2>
            <form id="contactForm" className="contact-form-fields" onSubmit={onSubmit}>
              <div className="contact-form-group">
                <label htmlFor="contact-name">Full Name</label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  className="contact-form-control"
                  placeholder="Institutional Name / Individual Name"
                  required
                />
              </div>
              <div className="contact-form-group">
                <label htmlFor="contact-email">Email Address</label>
                <div className="contact-input-wrap contact-input-wrap--email">
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    className="contact-form-control"
                    placeholder="name@company.com"
                    required
                    autoComplete="email"
                  />
                  <span className="contact-input-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </span>
                </div>
              </div>
              <div className="contact-form-group">
                <label htmlFor="contact-topic">Query Topic</label>
                <select
                  id="contact-topic"
                  name="topic"
                  className="contact-form-control contact-form-select"
                  required
                  defaultValue=""
                >
                  <option value="">Select a Topic</option>
                  <option value="investment">Investment Plans</option>
                  <option value="technical">Technical Support</option>
                  <option value="partnership">Partnership Inquiry</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="contact-form-group">
                <label htmlFor="contact-message">Your Message</label>
                <textarea
                  id="contact-message"
                  name="message"
                  className="contact-form-control contact-form-textarea"
                  rows={5}
                  placeholder="How can we assist you today?"
                  required
                />
              </div>
              <button type="submit" className="contact-transmit-btn">
                Transmit Message
              </button>
            </form>
          </div>
        </Reveal>
      </section>

      <footer className="contact-page-footer">
        <div className="lp-container contact-footer-grid">
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
            <p className="contact-footer-about">
              Empowering global trade through secure and transparent financial infrastructure.
            </p>
          </div>
          <div className="footer-links">
            <h4 className="contact-footer-col-title">Navigation</h4>
            <ul className="contact-footer-list">
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/plans">Plans</Link>
              </li>
              <li>
                <Link to="/contact">Support</Link>
              </li>
            </ul>
          </div>
          {footerNote ? (
            <div>
              <h4 className="contact-footer-col-title">Official Info</h4>
              <p className="contact-footer-info whitespace-pre-line">{footerNote}</p>
            </div>
          ) : null}
        </div>
        <div className="contact-footer-copy">
          © {new Date().getFullYear()} RichPay International. Secure Asset Management.
        </div>
      </footer>
    </div>
  )
}
