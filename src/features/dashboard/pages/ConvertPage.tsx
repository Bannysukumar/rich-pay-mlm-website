import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { convertIncomeToActivationCallable, resolveUsernameCallable } from '@/lib/api/financeCallables'
import { useAuthState } from '@/hooks/useAuth'

export function ConvertPage() {
  const { profile } = useAuthState()
  const [transferto, setTransferto] = useState('')
  const [rname, setRname] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)

  const income = profile?.wallets.cash ?? 0

  const showHint = useCallback(async (username: string) => {
    const u = username.trim().toLowerCase()
    if (!u) {
      setRname('')
      return
    }
    try {
      const { fullName } = await resolveUsernameCallable(u)
      setRname(fullName === 'Invalid Id' ? 'Invalid Id' : fullName)
    } catch {
      setRname('Invalid Id')
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const amount = Number(amountStr)
    if (!transferto.trim()) {
      toast.error('Enter Transfer to UserID')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid USDT amount')
      return
    }
    if (profile.transactionPinSet && !cpin.trim()) {
      toast.error('Enter transaction password')
      return
    }
    setBusy(true)
    try {
      await convertIncomeToActivationCallable({
        beneficiaryUsername: transferto.trim(),
        amount,
        transactionPassword: cpin.trim() || undefined,
      })
      toast.success('Converted to activation wallet')
      setAmountStr('')
      setCpin('')
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : ''
      toast.error(msg || 'Conversion failed — check balance, UserID, and deploy latest functions')
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
                <h4 className="card-title">
                  Convert to Activation Wallet (Income $ {income.toFixed(4)})
                </h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
                  <form name="form1" method="post" onSubmit={(ev) => void submit(ev)}>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="transferto">
                        Transfer to UserID
                      </label>
                      <input
                        type="text"
                        className="form-control input-default"
                        placeholder="Transfer to UserID"
                        name="transferto"
                        id="transferto"
                        value={transferto}
                        onChange={(e) => setTransferto(e.target.value)}
                        onBlur={(e) => void showHint(e.target.value)}
                        disabled={busy}
                        autoComplete="off"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="rname">
                        Name of the Member
                      </label>
                      <input
                        type="text"
                        className="form-control input-default"
                        name="rname"
                        id="rname"
                        value={rname}
                        onChange={(e) => setRname(e.target.value)}
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="amount">
                        USDT to Convert
                      </label>
                      <input
                        type="number"
                        className="form-control input-default"
                        placeholder="Amount"
                        name="amount"
                        id="amount"
                        value={amountStr}
                        onChange={(e) => setAmountStr(e.target.value)}
                        min={0}
                        step="0.0001"
                        disabled={busy}
                      />
                    </div>
                    <div className="mb-3 col-md-12">
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
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? 'Please wait…' : 'Submit'}
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
