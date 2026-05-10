import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { DepositSettingsStrip } from '@/components/deposits/DepositSettingsStrip'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type DepositRow = {
  id: string
  amount: number
  createdAtMs: number
}

function paymentIdFromDocId(id: string): string {
  const alnum = id.replace(/[^a-zA-Z0-9]/g, '')
  return (alnum.slice(0, 13) || id.slice(0, 13)).toUpperCase()
}

function fmtDateTime(ms: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const PLACEHOLDER_WALLET = '0x0000000000000000000000000000000000000000'

function isConfiguredWallet(a: string): boolean {
  const t = a.trim()
  if (!t) return false
  return t.toLowerCase() !== PLACEHOLDER_WALLET.toLowerCase()
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s.trim())
}

export function DepositViewQrPage() {
  const { firebaseUid } = useAuthState()
  const { settings, loaded: settingsLoaded } = useSiteSettings()
  const [rows, setRows] = useState<DepositRow[]>([])
  const [loading, setLoading] = useState(true)
  const [qrFor, setQrFor] = useState<DepositRow | null>(null)

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.deposits),
      where('userId', '==', firebaseUid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: DepositRow[] = []
        snap.forEach((doc) => {
          const d = doc.data()
          const created = d.createdAt
          const createdAtMs =
            created && typeof created.toMillis === 'function' ? created.toMillis() : 0
          next.push({
            id: doc.id,
            amount: Number(d.amount ?? 0),
            createdAtMs,
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load deposits')
      },
    )
    return () => unsub()
  }, [firebaseUid])

  const address = useMemo(() => settings.depositWalletAddress?.trim() ?? '', [settings.depositWalletAddress])
  const qrUrl = useMemo(() => settings.qrCodeUrl?.trim() ?? '', [settings.qrCodeUrl])
  const hasWallet = isConfiguredWallet(address)
  const hasQrImage = Boolean(qrUrl && isHttpUrl(qrUrl))

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">View QR</h4>
              </div>
              <div className="card-body">
                <DepositSettingsStrip settings={settings} settingsLoaded={settingsLoaded} showQrThumb />
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Serial</th>
                        <th>Date/Time</th>
                        <th>Payment ID</th>
                        <th>USDT</th>
                        <th>Address</th>
                        <th>View QR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-secondary">
                            No deposit requests yet. Use Create QR to add one.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDateTime(r.createdAtMs)}</td>
                            <td className="font-monospace text-nowrap">{paymentIdFromDocId(r.id)}</td>
                            <td>{r.amount}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-link p-0 text-primary text-decoration-underline"
                                onClick={() => setQrFor(r)}
                              >
                                Address
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-link p-0 text-primary text-decoration-underline"
                                onClick={() => setQrFor(r)}
                              >
                                View QR
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {qrFor && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrFor(null)
          }}
        >
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content bg-dark text-light border border-secondary">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">QR — {paymentIdFromDocId(qrFor.id)}</h5>
                <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={() => setQrFor(null)} />
              </div>
              <div className="modal-body text-center">
                <p className="small text-secondary mb-2">
                  {settings.depositNetwork} · Invoice {qrFor.amount} {settings.currencyLabel ?? 'USDT'} · Min deposit{' '}
                  {settings.minDeposit}
                </p>
                {settings.depositInstructions ? (
                  <p className="small text-start text-secondary mb-3" style={{ whiteSpace: 'pre-wrap' }}>
                    {settings.depositInstructions}
                  </p>
                ) : null}
                {!settingsLoaded ? (
                  <p className="small text-secondary">Loading deposit settings…</p>
                ) : hasQrImage ? (
                  <div className="d-inline-block rounded-3 border border-secondary bg-white p-3">
                    <img
                      src={qrUrl}
                      alt="Deposit QR code"
                      className="mx-auto d-block"
                      style={{ maxWidth: 280, maxHeight: 280, width: '100%', height: 'auto' }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="alert alert-warning text-start small" role="status">
                    No QR image published yet. An administrator must upload one under <strong>Admin → QR &amp; Deposit</strong>.
                  </div>
                )}
                {hasWallet ? (
                  <>
                    <p className="mt-3 mb-2 small text-secondary text-start">Treasury wallet (copy exactly)</p>
                    <p className="mb-3 small text-break font-monospace text-start px-2">{address}</p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void navigator.clipboard.writeText(address)
                        toast.success('Address copied')
                      }}
                    >
                      Copy address
                    </button>
                  </>
                ) : (
                  <p className="mt-3 small text-warning">
                    Deposit wallet address is not configured yet. Ask your administrator to set the treasury address in{' '}
                    <strong>Admin → QR &amp; Deposit</strong>.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
