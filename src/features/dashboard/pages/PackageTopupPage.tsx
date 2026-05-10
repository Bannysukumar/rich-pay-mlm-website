import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { activatePackageCallable, resolveUsernameCallable } from '@/lib/api/financeCallables'
import { useAuthState } from '@/hooks/useAuth'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { PackageDef } from '@/types/models'

const PACKAGE_TIERS = [
  { value: '1', label: '$ 100' },
  { value: '2', label: '$ 200' },
  { value: '3', label: '$ 300' },
  { value: '4', label: '$ 400' },
  { value: '5', label: '$ 500' },
] as const

function tierAmount(entry: string): number {
  const n = Number(entry)
  if (!Number.isFinite(n) || n < 1 || n > 5) return 0
  return n * 100
}

function findPackageForAmount(amount: number, packages: PackageDef[]): PackageDef | undefined {
  return packages.find((p) => amount >= p.minAmount && amount <= p.maxAmount)
}

export function PackageTopupPage() {
  const { profile } = useAuthState()
  const [packages, setPackages] = useState<PackageDef[]>([])
  const [idno, setIdno] = useState('')
  const [rname, setRname] = useState('')
  const [entry, setEntry] = useState('1')
  const [ptype, setPtype] = useState('-1')
  const [cpin, setCpin] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.packages), where('active', '==', true))
    return onSnapshot(q, (snap) => {
      setPackages(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            name: String(x.name ?? 'Package'),
            minAmount: Number(x.minAmount ?? 0),
            maxAmount: Number(x.maxAmount ?? 0),
            roiPercent: Number(x.roiPercent ?? 0),
            durationDays: Number(x.durationDays ?? 0),
            active: Boolean(x.active),
          }
        }),
      )
    })
  }, [])

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
    if (ptype === '-1') {
      toast.error('Select Plan')
      return
    }
    if (profile.transactionPinSet && !cpin.trim()) {
      toast.error('Enter transaction password')
      return
    }
    const amount = tierAmount(entry)
    const pkg = findPackageForAmount(amount, packages)
    if (!pkg) {
      toast.error('No package matches this tier — check admin package ranges.')
      return
    }
    setBusy(true)
    try {
      await activatePackageCallable({
        packageId: pkg.id,
        amount,
        beneficiaryUsername: idno.trim(),
        transactionPassword: cpin.trim() || undefined,
        planType: Number(ptype),
      })
      toast.success('Package purchased')
      setCpin('')
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : ''
      toast.error(msg || 'Topup failed — check wallets, deposit 50% rule, and deploy latest functions')
    } finally {
      setBusy(false)
    }
  }

  const act = profile?.wallets.activation ?? 0
  const dep = profile?.wallets.deposit ?? 0

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">
                  Buy Package (Activation Wallet - $ {act.toFixed(2)}, Deposit Wallet - $ {dep.toFixed(2)})
                </h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
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
                    <label className="form-label" htmlFor="entry">
                      Select Package
                    </label>
                    <select
                      name="entry"
                      id="entry"
                      className="default-select form-control wide mb-3"
                      value={entry}
                      onChange={(e) => setEntry(e.target.value)}
                      disabled={busy}
                    >
                      {PACKAGE_TIERS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
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
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                  <p className="mt-3 mb-0 small text-secondary">
                    Note :- Minimum a 50 % of value is required in Deposit Wallet.
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
