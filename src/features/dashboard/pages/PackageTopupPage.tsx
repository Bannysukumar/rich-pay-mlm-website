import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { activatePackageCallable, resolveUsernameCallable } from '@/lib/api/financeCallables'
import { StatusNotice } from '@/components/ui/StatusNotice'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { splitTopupWalletDebit } from '@/lib/finance/splitTopupWallet'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { PackageDef } from '@/types/models'

function sortPackages(list: PackageDef[]): PackageDef[] {
  return [...list].sort((a, b) => {
    const ao = a.sortOrder ?? 0
    const bo = b.sortOrder ?? 0
    if (ao !== bo) return ao - bo
    return a.minAmount - b.minAmount
  })
}

export function PackageTopupPage() {
  const { profile } = useAuthState()
  const { settings } = useSiteSettings()
  /** Must match Cloud Function `activatePackage` (see `enforcePackageTopupDirectReferralOnly`). */
  const topupRestrictToDirectReferrals =
    settings.restrictPackageTopupToDirectReferrals === true &&
    settings.allowActivationTransferToAnyUser !== true
  const [packages, setPackages] = useState<PackageDef[]>([])
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [idno, setIdno] = useState('')
  const [rname, setRname] = useState('')
  const [ptype, setPtype] = useState('-1')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitBanner, setSubmitBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const sortedPackages = useMemo(() => sortPackages(packages), [packages])

  const catalog = useMemo(() => {
    const wantCompound = ptype === '2'
    return sortedPackages.filter((p) =>
      wantCompound ? p.packageShelf === 'compounding' : p.packageShelf !== 'compounding',
    )
  }, [sortedPackages, ptype])

  const selectedPkg = useMemo(
    () => catalog.find((p) => p.id === selectedPackageId),
    [catalog, selectedPackageId],
  )

  const amountNum = Number(amountInput)
  const splitPreview = useMemo(() => {
    if (!selectedPkg || !Number.isFinite(amountNum) || amountNum <= 0) return null
    const min = Math.min(selectedPkg.minAmount, selectedPkg.maxAmount)
    const max = Math.max(selectedPkg.minAmount, selectedPkg.maxAmount)
    if (amountNum < min || amountNum > max) return null
    return splitTopupWalletDebit(amountNum)
  }, [selectedPkg, amountNum])

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.packages), where('active', '==', true))
    return onSnapshot(q, (snap) => {
      const next: PackageDef[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>
        const shelfRaw = String(x.packageShelf ?? 'investment').toLowerCase()
        return {
          id: d.id,
          name: String(x.name ?? 'Package'),
          minAmount: Number(x.minAmount ?? 0),
          maxAmount: Number(x.maxAmount ?? 0),
          roiPercent: Number(x.roiPercent ?? 0),
          durationDays: Number(x.durationDays ?? 0),
          active: Boolean(x.active),
          sortOrder: Number(x.sortOrder ?? 0),
          maxRoiMultiplier: Number(x.maxRoiMultiplier ?? 2),
          packageShelf: shelfRaw === 'compounding' ? 'compounding' : 'investment',
        }
      })
      setPackages(next)
    })
  }, [])

  useEffect(() => {
    if (catalog.length === 0) {
      setSelectedPackageId('')
      return
    }
    const stillValid = catalog.some((p) => p.id === selectedPackageId)
    if (!stillValid) setSelectedPackageId(catalog[0].id)
  }, [catalog, selectedPackageId])

  useEffect(() => {
    if (!selectedPkg) {
      setAmountInput('')
      return
    }
    const min = selectedPkg.minAmount
    const max = selectedPkg.maxAmount
    const lo = Math.min(min, max)
    setAmountInput(String(lo))
  }, [selectedPkg])

  useEffect(() => {
    if (profile?.username) {
      setIdno(profile.username)
      setRname(profile.fullName?.trim() || '')
    }
  }, [profile?.username, profile?.fullName])

  const showHint = useCallback(async (username: string) => {
    const u = username.trim().toLowerCase()
    if (!u) {
      setRname('')
      return
    }
    try {
      const { fullName } = await resolveUsernameCallable(u)
      setRname(fullName)
    } catch {
      setRname('Invalid Id')
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!selectedPkg) {
      toast.error('No package available — ask admin to publish packages.')
      return
    }
    if (ptype === '-1') {
      toast.error('Select Plan')
      return
    }
    if (profile.transactionPinSet && !cpin.trim()) {
      toast.error('Enter transaction password')
      return
    }
    const amount = Number(amountInput)
    const min = Math.min(selectedPkg.minAmount, selectedPkg.maxAmount)
    const max = Math.max(selectedPkg.minAmount, selectedPkg.maxAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid package amount')
      return
    }
    if (amount < min || amount > max) {
      toast.error(`Amount must be between $${min} and $${max} for "${selectedPkg.name}"`)
      return
    }

    const beneUser = idno.trim()
    const selfUser = profile.username?.trim().toLowerCase() ?? ''
    const isSelf = beneUser.toLowerCase() === selfUser
    const planLabel = ptype === '2' ? 'Compounding' : 'Daily'

    setSubmitBanner(null)
    setBusy(true)
    try {
      const res = await toast.promise(
        activatePackageCallable({
          packageId: selectedPkg.id,
          amount,
          beneficiaryUsername: beneUser,
          transactionPassword: cpin.trim() || undefined,
          planType: Number(ptype),
        }),
        {
          loading: 'Activating package…',
          success: () =>
            isSelf
              ? `Success: package activated — $${amount.toFixed(2)} · ${selectedPkg.name} (${planLabel}).`
              : `Success: package activated for ${beneUser} — $${amount.toFixed(2)} · ${selectedPkg.name} (${planLabel}).`,
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Activation failed — check Activation + Deposit (50/50), plan type, and transaction password.',
        },
        { duration: 5500, success: { duration: 6500 }, error: { duration: 9000 } },
      )
      const okText = isSelf
        ? `Your package is active: $${amount.toFixed(2)} (${selectedPkg.name}, ${planLabel}). Reference: ${res.activePackageId ?? '—'}.`
        : `Package activated for ${beneUser}: $${amount.toFixed(2)} (${selectedPkg.name}, ${planLabel}).`
      setSubmitBanner({ kind: 'success', text: okText })
      setCpin('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Activation failed — check wallets (50% Activation + 50% Deposit), plan selection, and deploy latest functions.'
      setSubmitBanner({ kind: 'error', text: msg })
    } finally {
      setBusy(false)
    }
  }

  const act = profile?.wallets.activation ?? 0
  const dep = profile?.wallets.deposit ?? 0

  const minAmt = selectedPkg ? Math.min(selectedPkg.minAmount, selectedPkg.maxAmount) : 0
  const maxAmt = selectedPkg ? Math.max(selectedPkg.minAmount, selectedPkg.maxAmount) : 0
  const fixedAmountOnly = selectedPkg != null && minAmt === maxAmt

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">
                  Buy Package — Activation ${act.toFixed(2)} · Deposit ${dep.toFixed(2)}
                </h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
                  {submitBanner ? (
                    <StatusNotice
                      variant={submitBanner.kind}
                      message={submitBanner.text}
                      onDismiss={() => setSubmitBanner(null)}
                    />
                  ) : null}
                  <form name="form1" method="post" onSubmit={(ev) => void submit(ev)}>
                    <div className="mb-3">
                      <div className="form-label">UserID to Topup</div>
                      <input
                        type="text"
                        name="idno"
                        id="idno"
                        className="form-control input-default"
                        placeholder="UserID"
                        value={idno}
                        onChange={(e) => setIdno(e.target.value)}
                        onBlur={() => void showHint(idno)}
                        disabled={busy}
                        autoComplete="off"
                      />
                      <p className="mt-2 mb-0 small text-secondary">
                        {topupRestrictToDirectReferrals ? (
                          <>
                            <strong className="text-warning">Referral rule on:</strong> UserID must be{' '}
                            <strong>you</strong> or someone who joined with <strong>you</strong> as sponsor (direct
                            referral).
                          </>
                        ) : (
                          <>
                            <strong className="text-info">Open top-up:</strong> you may enter any valid member UserID
                            to receive this package (admin can turn referral-only mode on under Transfer settings).
                          </>
                        )}
                      </p>
                    </div>
                    <div className="mb-3">
                      <div className="form-label">Name of the Member</div>
                      <input
                        type="text"
                        name="rname"
                        id="rname"
                        className="form-control input-default"
                        placeholder="Name of the Member"
                        value={rname}
                        onChange={(e) => setRname(e.target.value)}
                      />
                    </div>
                    <label className="form-label" htmlFor="packageId">
                      Select Package
                    </label>
                    <select
                      name="packageId"
                      id="packageId"
                      className="default-select form-control wide mb-3"
                      value={selectedPackageId}
                      onChange={(e) => setSelectedPackageId(e.target.value)}
                      disabled={busy || catalog.length === 0}
                    >
                      {catalog.length === 0 ? (
                        <option value="">No packages for this plan type</option>
                      ) : (
                        catalog.map((p) => {
                          const lo = Math.min(p.minAmount, p.maxAmount)
                          const hi = Math.max(p.minAmount, p.maxAmount)
                          const range = lo === hi ? `$${lo}` : `$${lo} – $${hi}`
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} ({range})
                            </option>
                          )
                        })
                      )}
                    </select>
                    {selectedPkg && (
                      <div className="mb-3">
                        <label className="form-label" htmlFor="amount">
                          Amount (USDT){fixedAmountOnly ? ' — fixed for this package' : ` — allowed $${minAmt}–$${maxAmt}`}
                        </label>
                        <input
                          type="number"
                          name="amount"
                          id="amount"
                          className="form-control input-default"
                          min={minAmt}
                          max={maxAmt}
                          step="0.01"
                          value={amountInput}
                          onChange={(e) => setAmountInput(e.target.value)}
                          disabled={busy || fixedAmountOnly}
                          required
                        />
                        {splitPreview ? (
                          <p className="mt-2 mb-0 small text-muted">
                            Debit: <strong>${splitPreview.activation.toFixed(2)}</strong> from Activation +{' '}
                            <strong>${splitPreview.deposit.toFixed(2)}</strong> from Deposit (50% / 50%).
                          </p>
                        ) : null}
                      </div>
                    )}
                    <select
                      name="ptype"
                      id="ptype"
                      className="default-select form-control wide mb-3"
                      value={ptype}
                      onChange={(e) => setPtype(e.target.value)}
                      disabled={busy}
                    >
                      <option value="-1">Select Plan</option>
                      <option value="1">Daily Plan</option>
                      <option value="2">Compounding Plan</option>
                    </select>
                    <div className="mb-3">
                      <div className="form-label">Transaction Password</div>
                      <input
                        type="password"
                        name="cpin"
                        id="cpin"
                        className="form-control input-default"
                        placeholder="Transaction Password"
                        value={cpin}
                        onChange={(e) => setCpin(e.target.value)}
                        disabled={busy}
                        autoComplete="new-password"
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={busy || !selectedPkg}>
                      {busy ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                  <p className="mt-3 mb-0 small text-secondary">
                    Payment is split <strong>50%</strong> from your Activation wallet and <strong>50%</strong> from your
                    Deposit wallet (total equals the package amount).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
