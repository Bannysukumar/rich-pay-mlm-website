import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

function fmtDate(ms: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function daysRemaining(endsAtMs: number, status: string): number {
  if (status === 'completed' || status === 'capped') return 0
  const d = Math.ceil((endsAtMs - Date.now()) / 86400000)
  return Math.max(0, d)
}

function planLabel(planType: unknown): string {
  const p = String(planType ?? 'daily').toLowerCase()
  if (p === 'compounding') return 'Compounding Plan'
  return 'Daily Plan'
}

type Row = {
  id: string
  startedAtMs: number
  endsAtMs: number
  amount: number
  status: string
  planType: unknown
}

export function PackageTopupHistoryPage() {
  const { firebaseUid } = useAuthState()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.activePackages),
      where('userId', '==', firebaseUid),
      orderBy('startedAt', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((doc) => {
          const d = doc.data()
          const started = d.startedAt
          const ends = d.endsAt
          const startedAtMs =
            started && typeof started.toMillis === 'function' ? started.toMillis() : 0
          const endsAtMs = ends && typeof ends.toMillis === 'function' ? ends.toMillis() : 0
          next.push({
            id: doc.id,
            startedAtMs,
            endsAtMs,
            amount: Number(d.amount ?? 0),
            status: String(d.status ?? 'active'),
            planType: d.planType,
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load topup history')
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
                <h4 className="card-title mb-0">Topup History</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Days Remaining</th>
                        <th>Plan Type</th>
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
                            No topup records yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.startedAtMs)}</td>
                            <td>$ {r.amount}</td>
                            <td>{daysRemaining(r.endsAtMs, r.status)}</td>
                            <td>{planLabel(r.planType)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Amount</th>
                      </tr>
                    </tfoot>
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
