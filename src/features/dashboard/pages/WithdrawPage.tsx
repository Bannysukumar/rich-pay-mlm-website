import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { StatusNotice } from '@/components/ui/StatusNotice'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { createWithdrawalCallable } from '@/lib/api/financeCallables'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import { isLiveActivePackage } from '@/lib/activePackagesDisplay'
import {
  computeMaxWithdrawForPrincipal,
  computeWithdrawalCooldown,
  fmtNextAutoSummary,
  isWithdrawalAmountStepValid,
  isWithinWithdrawalWindow,
  livePolicyFromSiteSettings,
  mergeWithdrawPolicy,
  withdrawalAmountStep,
  withdrawalCooldownHours,
} from '@/lib/withdrawPolicy'

export function WithdrawPage() {
  const { profile, firebaseUid } = useAuthState()
  const { settings } = useSiteSettings()
  const [epoints, setEpoints] = useState('')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)
  const [maxPrincipal, setMaxPrincipal] = useState(0)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [lastWithdrawMs, setLastWithdrawMs] = useState<number | null>(null)

  const cash = profile?.wallets.cash ?? 0
  const defaultAddress = profile?.usdtBep20Address?.trim() ?? ''

  useEffect(() => {
    if (!firebaseUid) {
      setMaxPrincipal(0)
      return
    }
    const q = query(collection(db, COLLECTIONS.activePackages), where('userId', '==', firebaseUid))
    return onSnapshot(q, (snap) => {
      let mx = 0
      snap.forEach((d) => {
        const row = d.data() as Record<string, unknown>
        if (!isLiveActivePackage(row)) return
        mx = Math.max(mx, Number(row.amount ?? 0))
      })
      setMaxPrincipal(mx)
    })
  }, [firebaseUid])

  useEffect(() => {
    if (!firebaseUid) {
      setLastWithdrawMs(null)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.withdrawals),
      where('userId', '==', firebaseUid),
      orderBy('createdAt', 'desc'),
      limit(15),
    )
    return onSnapshot(q, (snap) => {
      for (const d of snap.docs) {
        const row = d.data() as Record<string, unknown>
        if (String(row.status ?? '') === 'rejected') continue
        const c = row.createdAt as { toMillis?: () => number } | undefined
        if (c && typeof c.toMillis === 'function') {
          setLastWithdrawMs(c.toMillis())
          return
        }
      }
      setLastWithdrawMs(null)
    })
  }, [firebaseUid])

  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 15_000)
    const onVis = () => setClockTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const policy = useMemo(
    () =>
      mergeWithdrawPolicy(
        livePolicyFromSiteSettings(settings),
        profile?.withdrawalPolicySnapshot ?? undefined,
      ),
    [settings, profile?.withdrawalPolicySnapshot],
  )

  const maxForRequest = useMemo(
    () =>
      policy.withdrawalRequiresActivePackage === false
        ? Number.POSITIVE_INFINITY
        : computeMaxWithdrawForPrincipal(maxPrincipal, policy),
    [policy, maxPrincipal],
  )

  const minWithdraw = Number(policy.minWithdrawal ?? settings.minWithdrawal)
  const feePercent = Number(policy.withdrawFeePercent ?? settings.withdrawFeePercent)
  const amountStep = withdrawalAmountStep(policy)
  const cooldownH = withdrawalCooldownHours(policy)

  const windowOpen = useMemo(() => isWithinWithdrawalWindow(policy), [policy, clockTick])

  const cooldown = useMemo(
    () => computeWithdrawalCooldown(lastWithdrawMs, cooldownH, Date.now()),
    [lastWithdrawMs, cooldownH, clockTick],
  )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const amount = Number(epoints)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter Amount')
      return
    }
    if (policy.withdrawalsEnabled === false) {
      toast.error('Withdrawals are disabled — check back later')
      return
    }
    if (!windowOpen) {
      toast.error('Outside the allowed withdrawal time window')
      return
    }
    if (policy.withdrawalRequiresActivePackage !== false && maxPrincipal <= 0) {
      toast.error('You need an active package to withdraw')
      return
    }
    if (amount < minWithdraw) {
      toast.error(`Minimum withdrawal ${minWithdraw} USDT`)
      return
    }
    if (!isWithdrawalAmountStepValid(amount, amountStep)) {
      toast.error(`Amount must be a multiple of ${amountStep} USDT (e.g. ${amountStep}, ${amountStep * 2})`)
      return
    }
    if (cooldown.blocked && cooldown.nextEligibleAt != null) {
      toast.error(`Next withdrawal available after ${new Date(cooldown.nextEligibleAt).toLocaleString()}`)
      return
    }
    if (Number.isFinite(maxForRequest) && amount > maxForRequest + 1e-6) {
      toast.error(`Maximum for your active stake is ${maxForRequest.toFixed(2)} USDT this cycle`)
      return
    }
    if (!defaultAddress || defaultAddress.length < 10) {
      toast.error('Set your USDT BEP20 address on your profile first')
      return
    }
    if (amount > cash) {
      toast.error('Insufficient cash wallet')
      return
    }
    if (profile.transactionPinSet && !cpin.trim()) {
      toast.error('Enter transaction password')
      return
    }
    setBanner(null)
    setBusy(true)
    try {
      await toast.promise(
        createWithdrawalCallable({
          amount,
          address: defaultAddress,
          transactionPassword: cpin.trim() || undefined,
        }),
        {
          loading: 'Submitting withdrawal request…',
          success: (data) =>
            `Withdrawal queued: $${amount.toFixed(2)} gross (ref ${String(data.withdrawalId ?? '').slice(0, 10)}…).`,
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Withdrawal failed — check amount, window, caps, cash balance, and transaction password.',
        },
        { duration: 5500, success: { duration: 8000 }, error: { duration: 10000 } },
      )
      const net = amount - (amount * feePercent) / 100
      setBanner({
        kind: 'success',
        text: `Request submitted. Approx. net after ${feePercent}% fee: $${net.toFixed(4)} USDT. Admin will process your payout.`,
      })
      setEpoints('')
      setCpin('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Withdrawal failed — deploy latest Cloud Functions or adjust amount / timing.'
      setBanner({ kind: 'error', text: msg })
    } finally {
      setBusy(false)
    }
  }

  const feePreview = Number(epoints) > 0 ? (Number(epoints) * feePercent) / 100 : 0
  const netPreview = Number(epoints) > 0 ? Number(epoints) - feePreview : 0

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Withdrawal (Balance - $ {cash.toFixed(4)})</h4>
              </div>
              <div className="card-body">
                <div className="small text-secondary mb-3">
                  <div>
                    Network: <strong>{String(policy.withdrawNetworkLabel ?? settings.depositNetwork)}</strong>
                  </div>
                  <div>
                    Time window ({String(policy.withdrawalWindowTimezone ?? 'Etc/UTC')}):{' '}
                    <strong>
                      {String(policy.withdrawalWindowStart)} – {String(policy.withdrawalWindowEnd)}
                    </strong>{' '}
                    — {windowOpen ? <span className="text-success">open now</span> : <span className="text-warning">closed now</span>}
                  </div>
                  <div>
                    Fee: <strong>{feePercent}%</strong> · Min: <strong>${minWithdraw}</strong> · Step:{' '}
                    <strong>${amountStep}</strong> multiples only
                  </div>
                  {cooldownH > 0 ? (
                    <div>
                      Cooldown: <strong>{cooldownH}h</strong> between requests —{' '}
                      {cooldown.blocked && cooldown.nextEligibleAt != null ? (
                        <span className="text-warning">
                          next eligible {new Date(cooldown.nextEligibleAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-success">you may withdraw now</span>
                      )}
                    </div>
                  ) : null}
                  {policy.withdrawalRequiresActivePackage !== false && maxPrincipal > 0 ? (
                    <div>
                      Active package (max): <strong>${maxPrincipal.toFixed(2)}</strong> · Per-request cap:{' '}
                      <strong>${maxForRequest.toFixed(2)}</strong>
                    </div>
                  ) : policy.withdrawalRequiresActivePackage !== false ? (
                    <div className="text-warning">No active package — withdrawals blocked until you activate.</div>
                  ) : null}
                  <div className="mt-1">{fmtNextAutoSummary(settings)}</div>
                </div>
                <div className="basic-form">
                  {banner ? (
                    <StatusNotice
                      variant={banner.kind}
                      message={banner.text}
                      onDismiss={() => setBanner(null)}
                    />
                  ) : null}
                  <form name="form1" method="post" onSubmit={(ev) => void submit(ev)}>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="epoints">
                        USDT TO Withdraw
                      </label>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <input
                          type="text"
                          className="form-control input-default flex-grow-1"
                          style={{ minWidth: '200px' }}
                          name="epoints"
                          id="epoints"
                          placeholder={`e.g. ${amountStep}, ${amountStep * 2}, ${amountStep * 3}`}
                          value={epoints}
                          onChange={(e) => setEpoints(e.target.value)}
                          disabled={busy}
                          inputMode="decimal"
                          autoComplete="off"
                        />
                        <span className="text-muted f-s-14">
                          (Min ${minWithdraw}, multiples of ${amountStep})
                        </span>
                      </div>
                      {Number(epoints) > 0 && (
                        <p className="mt-2 mb-0 small text-secondary">
                          Est. fee ${feePreview.toFixed(4)} · Est. net ${netPreview.toFixed(4)}
                        </p>
                      )}
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="defaultAddress">
                        Default Address
                      </label>
                      <input
                        type="text"
                        className="form-control input-default"
                        id="defaultAddress"
                        readOnly
                        value={defaultAddress}
                        placeholder="0x2762617095D8Deb4b1456147CbE5A70FFd19C09E"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="cpin">
                        Transaction Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        placeholder="Transaction Password"
                        name="cpin"
                        id="cpin"
                        value={cpin}
                        onChange={(e) => setCpin(e.target.value)}
                        disabled={busy}
                        autoComplete="current-password"
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy || (cooldown.blocked && cooldownH > 0)}
                    >
                      {busy ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
