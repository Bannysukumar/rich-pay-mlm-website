import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { DepositSettingsStrip } from '@/components/deposits/DepositSettingsStrip'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

const QR_COOLDOWN_MS = 10 * 60 * 1000

async function getLatestDepositTime(userId: string): Promise<number | null> {
  const q = query(
    collection(db, COLLECTIONS.deposits),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const data = snap.docs[0].data()
  const ts = data.createdAt
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
  return null
}

export function DepositCreatePage() {
  const { firebaseUid } = useAuthState()
  const { settings, loaded: settingsLoaded } = useSiteSettings()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'form' | 'rateLimited'>('form')

  const checkRateLimit = useCallback(async (): Promise<boolean> => {
    if (!firebaseUid) return false
    const lastMs = await getLatestDepositTime(firebaseUid)
    if (lastMs == null) return false
    return Date.now() - lastMs < QR_COOLDOWN_MS
  }, [firebaseUid])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!firebaseUid) return
    const n = Number(amount)
    if (!Number.isFinite(n) || n < settings.minDeposit) {
      toast.error(`Minimum deposit is ${settings.minDeposit} USDT`)
      return
    }
    setBusy(true)
    try {
      const limited = await checkRateLimit()
      if (limited) {
        setView('rateLimited')
        return
      }
      await addDoc(collection(db, COLLECTIONS.deposits), {
        userId: firebaseUid,
        amount: n,
        status: 'pending',
        proofUrl: null,
        createdAt: serverTimestamp(),
      })
      toast.success('Deposit request submitted')
      setAmount('')
    } catch {
      toast.error('Could not submit — try again or check your connection')
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseUid) {
    return (
      <main>
        <div className="container-fluid p-4">
          <div className="alert alert-secondary">Loading…</div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <div className="container-fluid">
        {view === 'form' ? (
          <div className="row">
            <div className="col-xl-12 col-lg-12">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title mb-0">Deposit USDT</h4>
                </div>
                <div className="card-body">
                  <DepositSettingsStrip settings={settings} settingsLoaded={settingsLoaded} showQrThumb />
                  <div className="basic-form">
                    <form name="form1" onSubmit={(ev) => void submit(ev)}>
                      <div className="mb-3 col-md-12">
                        <label className="form-label" htmlFor="deposit-amount">
                          Enter USDT (BEP-20) to Add
                        </label>
                        <input
                          id="deposit-amount"
                          type="text"
                          className="form-control input-default"
                          placeholder="Enter USDT to Add"
                          name="amount"
                          autoComplete="off"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? 'Submitting…' : 'Submit'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="row">
            <div className="col-xl-12">
              <div className="card dz-card" id="color-alerts">
                <div className="card-header flex-wrap d-flex justify-content-between border-0">
                  <div>
                    <h4 className="card-title mb-0">Status</h4>
                  </div>
                </div>
                <div className="card-body pt-0">
                  <div
                    className="alert alert-warning solid alert-dismissible fade show d-flex align-items-start gap-2"
                    role="alert"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="me-2 alert-icon flex-shrink-0"
                      aria-hidden
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="flex-grow-1">
                      <strong>Warning! </strong> You have already created a QR Code within last 10 Minutes. Either Use
                      the Same Code or Create a New QR Code after 10 Minutes from its creation time.
                    </span>
                    <button
                      type="button"
                      className="btn-close ms-auto flex-shrink-0"
                      aria-label="Close"
                      onClick={() => setView('form')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
