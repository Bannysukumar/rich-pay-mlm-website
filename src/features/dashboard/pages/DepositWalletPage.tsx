import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

/** Matches template: 04/05/2026 05:44 AM */
function fmtDateTime(ms: number) {
  if (!ms) return '—'
  const d = new Date(ms)
  const datePart = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timePart = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart} ${timePart}`
}

function fmt4(n: number) {
  return n.toFixed(4)
}

function fmtLdgr(n: number) {
  if (!Number.isFinite(n)) return '—'
  const r = Math.round(n)
  if (Math.abs(n - r) < 1e-6) return String(r)
  return n.toFixed(2)
}

function crCell(credit: number) {
  return credit > 0 ? fmt4(credit) : '-'
}

function dbCell(debit: number) {
  return debit > 0 ? fmt4(debit) : '-'
}

type Row = {
  id: string
  createdAtMs: number
  description: string
  details: string
  credit: number
  debit: number
  balanceAfter: number
}

export function DepositWalletPage() {
  const { firebaseUid, profile } = useAuthState()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const balance = profile?.wallets.deposit ?? 0

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.walletTransactions),
      where('userId', '==', firebaseUid),
      where('wallet', '==', 'deposit'),
      orderBy('createdAt', 'asc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((doc) => {
          const d = doc.data()
          const ts = d.createdAt
          const createdAtMs =
            ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
          const credit = Number(d.credit ?? d.cr ?? 0)
          const debit = Number(d.debit ?? d.db ?? 0)
          const balanceAfter = Number(d.balanceAfter ?? d.bal ?? d.balance ?? 0)
          next.push({
            id: doc.id,
            createdAtMs,
            description: String(d.description ?? d.type ?? '—'),
            details: String(d.details ?? d.detail ?? d.note ?? ''),
            credit,
            debit,
            balanceAfter,
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load deposit wallet history')
        setRows([])
      },
    )
    return () => unsub()
  }, [firebaseUid])

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Balance - $ {balance.toFixed(2)}</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Time </th>
                        <th>Description </th>
                        <th>Details </th>
                        <th>Cr.</th>
                        <th>Db.</th>
                        <th>Bal.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-secondary">
                            No deposit wallet transactions yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDateTime(r.createdAtMs)}</td>
                            <td>{r.description}</td>
                            <td>{r.details}</td>
                            <td>{crCell(r.credit)}</td>
                            <td>{dbCell(r.debit)}</td>
                            <td>{fmtLdgr(r.balanceAfter)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
