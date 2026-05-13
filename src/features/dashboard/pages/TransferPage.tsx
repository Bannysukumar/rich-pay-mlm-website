import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { StatusNotice } from '@/components/ui/StatusNotice'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { internalTransferCallable, resolveUsernameCallable } from '@/lib/api/financeCallables'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'

export function TransferPage() {
  const { profile } = useAuthState()
  const { settings, loaded: settingsLoaded } = useSiteSettings()
  const [transferto, setTransferto] = useState('')
  const [rname, setRname] = useState('')
  const [epoints, setEpoints] = useState('')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const amount = Number(epoints)
    if (!transferto.trim()) {
      toast.error('Enter Transfer To UserID')
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
    setBanner(null)
    setBusy(true)
    try {
      await toast.promise(
        internalTransferCallable({
          recipientUsername: toUser,
          amount,
          transactionPassword: cpin.trim() || undefined,
        }),
        {
          loading: 'Sending activation transfer…',
          success: `Success: $${amount.toFixed(4)} USDT sent to ${toUser}.`,
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Transfer failed — check Activation balance, recipient UserID, referral rules, and transaction password.',
        },
        { duration: 5500, success: { duration: 7000 }, error: { duration: 9000 } },
      )
      setBanner({
        kind: 'success',
        text: `Transfer completed: $${amount.toFixed(4)} USDT from your Activation wallet to UserID ${toUser}.`,
      })
      setEpoints('')
      setCpin('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Transfer failed — check balance, UserID, and deploy latest Cloud Functions.'
      setBanner({ kind: 'error', text: msg })
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
                <h4 className="card-title">Balance (Activation $ {activation.toFixed(2)})</h4>
              </div>
              <div className="card-body">
                {settingsLoaded ? (
                  <p className="text-muted small mb-3">
                    {settings.allowActivationTransferToAnyUser
                      ? 'Transfers may go to any member with a valid UserID (recipient must exist). You cannot transfer to yourself.'
                      : 'You can only transfer to your direct referrals. The UserID must exist in the system.'}
                  </p>
                ) : null}
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
                      <label className="form-label" htmlFor="transferto">
                        Transfer To UserID
                      </label>
                      <input
                        type="text"
                        className="form-control input-default"
                        placeholder="UserID"
                        name="transferto"
                        id="transferto"
                        value={transferto}
                        onChange={(e) => setTransferto(e.target.value)}
                        onBlur={(e) => void showHint(e.target.value)}
                        disabled={busy}
                        autoComplete="off"
                      />
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
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="epoints">
                        USDT to Transfer
                      </label>
                      <input
                        type="number"
                        className="form-control input-default"
                        placeholder="Amount"
                        name="epoints"
                        id="epoints"
                        value={epoints}
                        onChange={(e) => setEpoints(e.target.value)}
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
