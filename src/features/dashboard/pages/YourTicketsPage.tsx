import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

function deptLabel(code: string) {
  if (code === 'TEAMSUPPORT') return 'TEAM SUPPORT'
  return code || '—'
}

function priorityLabel(p: string) {
  if (p === 'URGENT') return 'UGRENT'
  return p || '—'
}

function statusLabel(s: string) {
  if (!s) return '—'
  const t = s.replace(/-/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

type Row = {
  id: string
  createdAtMs: number
  priority: string
  department: string
  subject: string
  status: string
}

export function YourTicketsPage() {
  const { firebaseUid } = useAuthState()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.tickets),
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
          next.push({
            id: doc.id,
            createdAtMs,
            priority: String(d.priority ?? ''),
            department: String(d.department ?? ''),
            subject: String(d.title ?? ''),
            status: String(d.status ?? ''),
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load tickets')
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
                <h4 className="card-title">Your Tickets</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Date </th>
                        <th>Priority</th>
                        <th>Department</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>View</th>
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
                            No tickets yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.createdAtMs)}</td>
                            <td>{priorityLabel(r.priority)}</td>
                            <td>{deptLabel(r.department)}</td>
                            <td>{r.subject || '—'}</td>
                            <td>{statusLabel(r.status)}</td>
                            <td>
                              <Link
                                to={`/dashboard/tickets/view?id=${encodeURIComponent(r.id)}`}
                                className="btn btn-sm btn-primary"
                              >
                                View
                              </Link>
                            </td>
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
