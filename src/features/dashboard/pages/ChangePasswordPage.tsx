import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { StatusNotice } from '@/components/ui/StatusNotice'
import { finalizeLoginPasswordChangeCallable } from '@/lib/api/authCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { changeTransactionPasswordCallable } from '@/lib/api/profileCallables'
import { setLocalAuthSessionVersion } from '@/lib/auth/authSessionVersion'
import { useAuthState } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase'

export function ChangePasswordPage() {
  const { profile } = useAuthState()

  const [oldLogin, setOldLogin] = useState('')
  const [newLogin, setNewLogin] = useState('')
  const [confirmLogin, setConfirmLogin] = useState('')
  const [busyLogin, setBusyLogin] = useState(false)

  const [oldTx, setOldTx] = useState('')
  const [newTx, setNewTx] = useState('')
  const [confirmTx, setConfirmTx] = useState('')
  const [busyTx, setBusyTx] = useState(false)
  const [bannerLogin, setBannerLogin] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [bannerTx, setBannerTx] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault()
    const user = auth.currentUser
    const email = user?.email
    if (!user || !email) {
      toast.error('Not signed in')
      return
    }
    if (newLogin.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newLogin !== confirmLogin) {
      toast.error('Confirmation does not match')
      return
    }
    setBannerLogin(null)
    setBusyLogin(true)
    try {
      await toast.promise(
        (async () => {
          const cred = EmailAuthProvider.credential(email, oldLogin)
          await reauthenticateWithCredential(user, cred)
          await updatePassword(user, newLogin)
          const { authSessionVersion } = await finalizeLoginPasswordChangeCallable()
          setLocalAuthSessionVersion(user.uid, authSessionVersion)
        })(),
        {
          loading: 'Updating login password…',
          success: 'Login password updated. Other signed-in devices were signed out.',
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Could not update login password — check your current password and try again.',
        },
        { duration: 5500, success: { duration: 7000 }, error: { duration: 10000 } },
      )
      setBannerLogin({
        kind: 'success',
        text: 'Your login password was changed. Any other browsers or devices using this account were signed out automatically.',
      })
      setOldLogin('')
      setNewLogin('')
      setConfirmLogin('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Could not update login password — verify your current password and network connection.'
      setBannerLogin({ kind: 'error', text: msg })
    } finally {
      setBusyLogin(false)
    }
  }

  const submitTx = async (e: FormEvent) => {
    e.preventDefault()
    if (newTx.length < 4) {
      toast.error('New transaction password must be at least 4 characters')
      return
    }
    if (newTx !== confirmTx) {
      toast.error('Confirmation does not match')
      return
    }
    if (profile?.transactionPinSet && !oldTx.trim()) {
      toast.error('Enter your current transaction password')
      return
    }
    setBannerTx(null)
    setBusyTx(true)
    try {
      await toast.promise(
        changeTransactionPasswordCallable({
          currentPassword: oldTx.trim() || undefined,
          newPassword: newTx,
        }),
        {
          loading: 'Updating transaction password…',
          success: 'Transaction password updated successfully.',
          error: (err) =>
            getCallableErrorMessage(err) ||
            'Could not update transaction password — check current PIN and deploy latest functions.',
        },
        { duration: 5500, success: { duration: 7000 }, error: { duration: 10000 } },
      )
      setBannerTx({
        kind: 'success',
        text: 'Your transaction password (PIN) for transfers and withdrawals was updated.',
      })
      setOldTx('')
      setNewTx('')
      setConfirmTx('')
    } catch (err: unknown) {
      const msg =
        getCallableErrorMessage(err) ||
        'Could not update transaction password — deploy latest Cloud Functions or verify your current PIN.'
      setBannerTx({ kind: 'error', text: msg })
    } finally {
      setBusyTx(false)
    }
  }

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Change Password</h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
                  {bannerLogin ? (
                    <StatusNotice
                      variant={bannerLogin.kind}
                      message={bannerLogin.text}
                      onDismiss={() => setBannerLogin(null)}
                    />
                  ) : null}
                  <form name="form1" method="post" onSubmit={(ev) => void submitLogin(ev)}>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="login-oldpassword">
                        Current Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        name="oldpassword"
                        id="login-oldpassword"
                        value={oldLogin}
                        onChange={(e) => setOldLogin(e.target.value)}
                        disabled={busyLogin}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="login-newpassword">
                        New Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        name="newpassword"
                        id="login-newpassword"
                        value={newLogin}
                        onChange={(e) => setNewLogin(e.target.value)}
                        disabled={busyLogin}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="login-cpassword">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        name="cpassword"
                        id="login-cpassword"
                        value={confirmLogin}
                        onChange={(e) => setConfirmLogin(e.target.value)}
                        disabled={busyLogin}
                        autoComplete="new-password"
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={busyLogin}>
                      {busyLogin ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Change Transaction Password</h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
                  {bannerTx ? (
                    <StatusNotice
                      variant={bannerTx.kind}
                      message={bannerTx.text}
                      onDismiss={() => setBannerTx(null)}
                    />
                  ) : null}
                  <form name="form2" method="post" onSubmit={(ev) => void submitTx(ev)}>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="tx-oldpassword">
                        Current Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        name="oldpassword"
                        id="tx-oldpassword"
                        value={oldTx}
                        onChange={(e) => setOldTx(e.target.value)}
                        disabled={busyTx}
                        autoComplete="off"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="tx-newpassword">
                        New Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        name="newpassword"
                        id="tx-newpassword"
                        value={newTx}
                        onChange={(e) => setNewTx(e.target.value)}
                        disabled={busyTx}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="tx-cpassword">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        className="form-control input-default"
                        name="cpassword"
                        id="tx-cpassword"
                        value={confirmTx}
                        onChange={(e) => setConfirmTx(e.target.value)}
                        disabled={busyTx}
                        autoComplete="new-password"
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={busyTx}>
                      {busyTx ? 'Submitting…' : 'Submit'}
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
