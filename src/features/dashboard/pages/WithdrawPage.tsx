import { useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { createWithdrawalCallable } from '@/lib/api/financeCallables'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'

export function WithdrawPage() {
  const { profile } = useAuthState()
  const { settings } = useSiteSettings()
  const [epoints, setEpoints] = useState('')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)

  const cash = profile?.wallets.cash ?? 0
  const defaultAddress = profile?.usdtBep20Address?.trim() ?? ''

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const amount = Number(epoints)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter Amount')
      return
    }
    if (amount < settings.minWithdrawal) {
      toast.error(`Minimum withdrawal ${settings.minWithdrawal} USDT`)
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
    setBusy(true)
    try {
      await createWithdrawalCallable({
        amount,
        address: defaultAddress,
        transactionPassword: cpin.trim() || undefined,
      })
      toast.success('Withdrawal queued for admin processing')
      setEpoints('')
      setCpin('')
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : ''
      toast.error(msg || 'Withdrawal failed — deploy latest Cloud Functions')
    } finally {
      setBusy(false)
    }
  }

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
                <div className="basic-form">
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
                          placeholder="Enter USDT to Withdraw"
                          value={epoints}
                          onChange={(e) => setEpoints(e.target.value)}
                          disabled={busy}
                          inputMode="decimal"
                          autoComplete="off"
                        />
                        <span className="text-muted f-s-14">(Minimum $ {settings.minWithdrawal})</span>
                      </div>
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
                    <button type="submit" className="btn btn-primary" disabled={busy}>
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
