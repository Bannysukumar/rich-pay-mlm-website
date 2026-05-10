import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { changeTransactionPasswordCallable } from '@/lib/api/profileCallables'
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
    setBusyLogin(true)
    try {
      const cred = EmailAuthProvider.credential(email, oldLogin)
      await reauthenticateWithCredential(user, cred)
      await updatePassword(user, newLogin)
      toast.success('Password updated')
      setOldLogin('')
      setNewLogin('')
      setConfirmLogin('')
    } catch {
      toast.error('Could not update — check current password')
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
    setBusyTx(true)
    try {
      await changeTransactionPasswordCallable({
        currentPassword: oldTx.trim() || undefined,
        newPassword: newTx,
      })
      toast.success('Transaction password updated')
      setOldTx('')
      setNewTx('')
      setConfirmTx('')
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : ''
      toast.error(msg || 'Could not update transaction password — deploy latest Cloud Functions')
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
