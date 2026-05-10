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

function describeEntry(d: Record<string, unknown>) {
  const desc = d.description
  if (typeof desc === 'string' && desc.trim()) return desc.trim()
  const level = d.level ?? d.teamLevel ?? d.lvl
  const n = typeof level === 'number' ? level : Number(level)
  if (Number.isFinite(n) && n > 0) return `Level ${n} Bonus`
  return 'Team Level Bonus'
}

type Row = {
  id: string
  createdAtMs: number
  description: string
  amount: number
}

export function TeamLevelBonusPage() {
  const { firebaseUid, profile } = useAuthState()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const total = profile?.teamLevelCommissionTotal ?? 0

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.teamLevelBonuses),
      where('userId', '==', firebaseUid),
      orderBy('createdAt', 'asc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>
          const ts = d.createdAt as { toMillis?: () => number } | undefined
          const createdAtMs =
            ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
          next.push({
            id: doc.id,
            createdAtMs,
            description: describeEntry(d),
            amount: Number(d.amount ?? 0),
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load team level bonus history')
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
                <h4 className="card-title">Total Team Level Bonus - $ {total.toFixed(4)}</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Date </th>
                        <th>Description </th>
                        <th>Amount </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={4} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-secondary">
                            No team level bonus entries yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.createdAtMs)}</td>
                            <td>{r.description}</td>
                            <td>{r.amount.toFixed(4)}</td>
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
