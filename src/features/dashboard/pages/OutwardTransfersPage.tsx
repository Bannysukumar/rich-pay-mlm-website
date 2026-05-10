import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

function fmtDate(ms: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function walletLabel(w: unknown): string {
  const s = String(w ?? '').toLowerCase()
  if (s === 'cash') return 'Cash Wallet'
  if (s === 'activation') return 'Activation Wallet'
  if (s === 'deposit') return 'Deposit Wallet'
  if (s.includes('cash')) return 'Cash Wallet'
  if (s.includes('activation')) return 'Activation Wallet'
  if (s.includes('deposit')) return 'Deposit Wallet'
  return typeof w === 'string' && w.length > 0 ? w : '—'
}

function fmtAmount(n: number) {
  return n.toFixed(4)
}

type Row = {
  id: string
  createdAtMs: number
  amount: number
  toUserDisplay: string
  wallet: string
}

export function OutwardTransfersPage() {
  const { firebaseUid } = useAuthState()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.internalTransfers),
      where('userId', '==', firebaseUid),
      orderBy('createdAt', 'desc'),
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
          const toUser =
            d.toUsername ??
            d.toUserId ??
            d.recipientUsername ??
            d.recipientUserId ??
            d.toUid ??
            '—'
          next.push({
            id: doc.id,
            createdAtMs,
            amount: Number(d.amount ?? 0),
            toUserDisplay: String(toUser),
            wallet: walletLabel(d.fromWallet ?? d.wallet ?? d.sourceWallet),
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load outward transfers')
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
                <h4 className="card-title mb-0">Transfers - Outward Report</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Time </th>
                        <th>Amount </th>
                        <th>To UserID </th>
                        <th>Wallet </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-secondary">
                            No outward transfers yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.createdAtMs)}</td>
                            <td>{fmtAmount(r.amount)}</td>
                            <td>{r.toUserDisplay}</td>
                            <td>{r.wallet}</td>
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
