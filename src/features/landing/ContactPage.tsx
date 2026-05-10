import type { FormEvent, ReactNode } from 'react'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
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

export function ContactPage() {
  useEffect(() => {
    document.title = 'Contact Us | RichPay Institutional Support'
  }, [])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    toast.success('Message received. Our team will respond within 2–4 hours.')
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
            <p className="contact-hero-sub">
              Our specialized team is available 24/7 to assist with your institutional trading and investment queries.
            </p>
          </Reveal>
        </div>
      </header>

      <section className="lp-container contact-cards-section">
        <div className="contact-grid-3">
          <Reveal>
            <div className="card glass text-center contact-info-card">
              <div className="contact-rank-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h3 className="text-gold">Email Support</h3>
              <p className="contact-card-meta">support@richpay.com</p>
            </div>
          </Reveal>
          <Reveal>
            <div className="card glass text-center contact-info-card">
              <div className="contact-rank-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.19 7L12 11.6L2.81 7M12 11.6V21M21.19 7L12 2.4L2.81 7M21.19 7V17L12 21.6M2.81 7V17L12 21.6" />
                </svg>
              </div>
              <h3 className="text-gold">Telegram Hub</h3>
              <p className="contact-card-meta">@RichPayOfficial</p>
            </div>
          </Reveal>
          <Reveal>
            <div className="card glass text-center contact-info-card">
              <div className="contact-rank-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="text-gold">Response Time</h3>
              <p className="contact-card-meta">Within 2-4 Hours</p>
            </div>
          </Reveal>
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
          <div>
            <h4 className="contact-footer-col-title">Official Info</h4>
            <p className="contact-footer-info">
              RichPay Support Center is active 24/5 during market hours. Weekend support remains standby for urgent
              institutional queries.
            </p>
          </div>
        </div>
        <div className="contact-footer-copy">
          © {new Date().getFullYear()} RichPay International. Secure Asset Management.
        </div>
      </footer>
    </div>
  )
}
