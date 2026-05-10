import type { SiteSettings } from '@/types/models'

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s.trim())
}

const PLACEHOLDER = '0x0000000000000000000000000000000000000000'

type Props = {
  settings: SiteSettings
  settingsLoaded?: boolean
  /** When false, hide QR thumbnail (e.g. Create page before admin uploads). */
  showQrThumb?: boolean
}

export function DepositSettingsStrip({ settings, settingsLoaded = true, showQrThumb = true }: Props) {
  const addr = settings.depositWalletAddress?.trim() ?? ''
  const hasAddr = addr.length > 0 && addr.toLowerCase() !== PLACEHOLDER.toLowerCase()
  const qr = settings.qrCodeUrl?.trim() ?? ''
  const hasQr = Boolean(qr && isHttpUrl(qr))

  return (
    <div className="alert alert-secondary border mb-4" role="status">
      {!settingsLoaded ? (
        <p className="mb-0 small">Loading deposit settings…</p>
      ) : (
        <>
          <div className="row g-3 align-items-start">
            <div className={showQrThumb && hasQr ? 'col-lg-8' : 'col-12'}>
              <div className="small mb-1">
                <strong>Network:</strong> {settings.depositNetwork}
              </div>
              <div className="small mb-1">
                <strong>Minimum deposit:</strong> {settings.minDeposit} {settings.currencyLabel ?? 'USDT'}
              </div>
              {hasAddr ? (
                <div className="small mb-1">
                  <strong>Treasury address:</strong>{' '}
                  <span className="font-monospace text-break">{addr}</span>
                </div>
              ) : (
                <p className="small text-warning mb-1">Treasury address not configured — contact support.</p>
              )}
              {settings.depositInstructions ? (
                <p className="small mb-0 mt-2 text-break" style={{ whiteSpace: 'pre-wrap' }}>
                  <strong>Instructions:</strong> {settings.depositInstructions}
                </p>
              ) : null}
            </div>
            {showQrThumb && hasQr ? (
              <div className="col-lg-4 text-center text-lg-end">
                <div className="d-inline-block rounded-2 border bg-white p-2">
                  <img
                    src={qr}
                    alt="Deposit QR"
                    className="d-block mx-auto"
                    style={{ maxWidth: 120, maxHeight: 120, width: '100%', height: 'auto' }}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <p className="small text-secondary mt-1 mb-0">Scan or copy the address above.</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
