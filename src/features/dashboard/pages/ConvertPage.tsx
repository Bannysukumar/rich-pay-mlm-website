import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { StatusNotice } from '@/components/ui/StatusNotice'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import {
  convertIncomeToActivationCallable,
  resolveUsernameCallable,
  walletConvertCallable,
} from '@/lib/api/financeCallables'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'

export function ConvertPage() {
  const { profile } = useAuthState()
  const { settings } = useSiteSettings()
  const showDepositToActivation = settings.depositToActivationConvertEnabled !== false
  const [depositToActAmount, setDepositToActAmount] = useState('')
  const [depositBusy, setDepositBusy] = useState(false)
  const [transferto, setTransferto] = useState('')
  const [rname, setRname] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)
  const [bannerDeposit, setBannerDeposit] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [bannerIncome, setBannerIncome] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const income = profile?.wallets.cash ?? 0
  const deposit = profile?.wallets.deposit ?? 0
  const activation = profile?.wallets.activation ?? 0

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

  const submitDepositToActivation = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const amount = Number(depositToActAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid USDT amount')
      return
    }
    if (amount > deposit + 1e-6) {
      toast.error('Amount exceeds Deposit Wallet balance')
      return
    }
    setBannerDeposit(null)
    setDepositBusy(true)
    try {
      await toast.promise(
        walletConvertCallable({ from: 'deposit', to: 'activation', amount }),
        {
          loading: 'Moving USDT to Activation wallet…',
          success: `Success: $${amount.toFixed(2)} moved from Deposit → Activation.`,
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Could not move funds — check balance, admin settings, or try again.',
        },
        { duration: 5500, success: { duration: 6500 }, error: { duration: 9000 } },
      )
      setBannerDeposit({
        kind: 'success',
        text: `$${amount.toFixed(2)} was debited from your Deposit wallet and credited to Activation.`,
      })
      setDepositToActAmount('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Could not move funds — check Deposit balance or whether this path is enabled.'
      setBannerDeposit({ kind: 'error', text: msg })
    } finally {
      setDepositBusy(false)
    }
  }

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
    const toUser = transferto.trim()
    setBannerIncome(null)
    setBusy(true)
    try {
      await toast.promise(
        convertIncomeToActivationCallable({
          beneficiaryUsername: toUser,
          amount,
          transactionPassword: cpin.trim() || undefined,
        }),
        {
          loading: 'Converting income to activation wallet…',
          success: `Success: $${amount.toFixed(4)} sent to ${toUser}'s Activation wallet.`,
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Conversion failed — check Cash balance, UserID (direct referral rules), and transaction password.',
        },
        { duration: 5500, success: { duration: 7000 }, error: { duration: 9000 } },
      )
      setBannerIncome({
        kind: 'success',
        text: `Income conversion completed: $${amount.toFixed(4)} USDT → Activation for UserID ${toUser}.`,
      })
      setAmountStr('')
      setCpin('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Conversion failed — check Cash wallet, recipient UserID, referral rules, and deploy latest functions.'
      setBannerIncome({ kind: 'error', text: msg })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            {showDepositToActivation ? (
              <div className="card mb-4">
                <div className="card-header">
                  <h4 className="card-title">
                    Deposit → Activation (Deposit $ {deposit.toFixed(2)} · Activation $ {activation.toFixed(2)})
                  </h4>
                </div>
                <div className="card-body">
                  <p className="small text-secondary mb-3">
                    Approved deposits land in your <strong>Deposit Wallet</strong>. Package top-ups are deducted from{' '}
                    <strong>Activation Wallet</strong> — move USDT here first, then use{' '}
                    <strong>Package → Topup</strong>.
                  </p>
                  {bannerDeposit ? (
                    <StatusNotice
                      variant={bannerDeposit.kind}
                      message={bannerDeposit.text}
                      onDismiss={() => setBannerDeposit(null)}
                    />
                  ) : null}
                  <form className="basic-form" onSubmit={(ev) => void submitDepositToActivation(ev)}>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="dep-to-act">
                        USDT to move
                      </label>
                      <input
                        id="dep-to-act"
                        type="number"
                        className="form-control input-default"
                        placeholder="Amount"
                        min={0}
                        step="0.0001"
                        value={depositToActAmount}
                        onChange={(e) => setDepositToActAmount(e.target.value)}
                        disabled={depositBusy}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={depositBusy}>
                      {depositBusy ? 'Please wait…' : 'Move to Activation Wallet'}
                    </button>
                  </form>
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="card-header">
                <h4 className="card-title">
                  Income (Cash) → Activation (Income $ {income.toFixed(4)})
                </h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
                  {bannerIncome ? (
                    <StatusNotice
                      variant={bannerIncome.kind}
                      message={bannerIncome.text}
                      onDismiss={() => setBannerIncome(null)}
                    />
                  ) : null}
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
