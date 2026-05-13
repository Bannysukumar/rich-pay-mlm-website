import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toaster } from 'react-hot-toast'

/** Same options as member dashboard — rendered on `document.body` so admin layout cannot clip or stack above toasts. */
const toastOptions = {
  duration: 4500,
  style: {
    background: '#1a1d24',
    color: '#e4e4e7',
    border: '1px solid rgba(212, 175, 55, 0.25)',
    borderRadius: '14px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  },
  success: {
    duration: 6500,
    style: {
      background: '#22c55e',
      color: '#0f172a',
      border: 'none',
      borderRadius: '14px',
      fontWeight: 600,
      padding: '14px 44px 14px 16px',
      boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      maxWidth: 'min(520px, 96vw)',
    },
    iconTheme: {
      primary: '#0f172a',
      secondary: '#22c55e',
    },
  },
  error: {
    duration: 9000,
    style: {
      background: '#dc2626',
      color: '#fef2f2',
      border: 'none',
      borderRadius: '14px',
      fontWeight: 600,
      padding: '14px 44px 14px 16px',
      boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      maxWidth: 'min(520px, 96vw)',
    },
    iconTheme: {
      primary: '#fef2f2',
      secondary: '#dc2626',
    },
  },
  loading: {
    style: {
      background: '#1e293b',
      color: '#e2e8f0',
      border: '1px solid rgba(148,163,184,0.35)',
      borderRadius: '14px',
    },
  },
} as const

/**
 * Mounts react-hot-toast on `document.body` (outside `#root`). Fixes admin panel
 * where sticky headers / sidebars and stacking contexts could hide toasts.
 */
export function BodyToaster() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready || typeof document === 'undefined') return null
  return createPortal(
    <Toaster
      position="top-center"
      containerStyle={{ zIndex: 2147483647 }}
      toastOptions={toastOptions}
    />,
    document.body,
  )
}
