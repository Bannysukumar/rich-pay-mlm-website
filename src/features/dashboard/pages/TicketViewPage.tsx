import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

function fmtDateTime(ms: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

type ListRow = {
  id: string
  createdAtMs: number
  priority: string
  department: string
  subject: string
  status: string
}

function TicketViewRepliesList() {
  const { firebaseUid } = useAuthState()
  const [rows, setRows] = useState<ListRow[]>([])
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
        const next: ListRow[] = []
        snap.forEach((d) => {
          const x = d.data()
          const ts = x.createdAt
          const createdAtMs =
            ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(x.createdAt ?? 0)
          next.push({
            id: d.id,
            createdAtMs,
            priority: String(x.priority ?? ''),
            department: String(x.department ?? ''),
            subject: String(x.title ?? ''),
            status: String(x.status ?? ''),
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
                <h4 className="card-title">Tickets - View Replies</h4>
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

type ReplyRow = { id: string; text: string; createdAtMs: number }

function TicketThread({ ticketId }: { ticketId: string }) {
  const { firebaseUid } = useAuthState()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [department, setDepartment] = useState('')
  const [priority, setPriority] = useState('')
  const [status, setStatus] = useState('')
  const [createdAtMs, setCreatedAtMs] = useState(0)
  const [replies, setReplies] = useState<ReplyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!firebaseUid || !ticketId) {
      setLoading(false)
      return
    }

    let cancelled = false
    let unsubReplies: (() => void) | undefined

    setLoading(true)
    setForbidden(false)

    void (async () => {
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.tickets, ticketId))
        if (cancelled) return
        if (!snap.exists()) {
          setForbidden(true)
          setLoading(false)
          return
        }
        const d = snap.data()
        if (d.userId !== firebaseUid) {
          setForbidden(true)
          setLoading(false)
          return
        }
        const ts = d.createdAt
        const ms =
          ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
        setTitle(String(d.title ?? ''))
        setMessage(String(d.message ?? ''))
        setDepartment(String(d.department ?? ''))
        setPriority(String(d.priority ?? ''))
        setStatus(String(d.status ?? ''))
        setCreatedAtMs(ms)
        setForbidden(false)

        const rq = query(
          collection(db, COLLECTIONS.ticketReplies),
          where('ticketId', '==', ticketId),
          orderBy('createdAt', 'asc'),
        )
        unsubReplies = onSnapshot(
          rq,
          (rSnap) => {
            if (cancelled) {
              return
            }
            const next: ReplyRow[] = []
            rSnap.forEach((docSnap) => {
              const r = docSnap.data()
              const rts = r.createdAt
              const rms =
                rts && typeof rts.toMillis === 'function'
                  ? rts.toMillis()
                  : Number(r.createdAt ?? 0)
              const text = String(r.message ?? r.body ?? r.text ?? '')
              next.push({ id: docSnap.id, text, createdAtMs: rms })
            })
            setReplies(next)
            setLoading(false)
          },
          () => {
            if (!cancelled) {
              setReplies([])
              setLoading(false)
              toast.error('Could not load replies')
            }
          },
        )
      } catch {
        if (!cancelled) {
          toast.error('Could not load ticket')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      unsubReplies?.()
    }
  }, [ticketId, firebaseUid])

  if (forbidden) {
    return (
      <main>
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <p className="text-secondary mb-2">Ticket not found or access denied.</p>
                  <Link to="/dashboard/tickets/view" className="btn btn-primary btn-sm">
                    Back to View Replies
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card mb-3">
              <div className="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h4 className="card-title mb-0">Ticket</h4>
                <Link to="/dashboard/tickets/view" className="btn btn-sm btn-light-primary">
                  ← Tickets - View Replies
                </Link>
              </div>
              <div className="card-body">
                {loading ? (
                  <p className="text-secondary mb-0">Loading…</p>
                ) : (
                  <>
                    <p className="mb-1">
                      <span className="text-muted">Subject:</span> {title || '—'}
                    </p>
                    <p className="mb-1">
                      <span className="text-muted">Date:</span> {fmtDateTime(createdAtMs)}
                    </p>
                    <p className="mb-1">
                      <span className="text-muted">Department:</span> {deptLabel(department)}
                    </p>
                    <p className="mb-1">
                      <span className="text-muted">Priority:</span> {priorityLabel(priority)}
                    </p>
                    <p className="mb-3">
                      <span className="text-muted">Status:</span> {statusLabel(status)}
                    </p>
                    <div className="mb-0">
                      <div className="form-label">Your message</div>
                      <div
                        className="form-control input-default"
                        style={{ minHeight: '120px', whiteSpace: 'pre-wrap' }}
                      >
                        {message || '—'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">Replies</h4>
              </div>
              <div className="card-body">
                {loading ? (
                  <p className="text-secondary mb-0">Loading…</p>
                ) : replies.length === 0 ? (
                  <p className="text-secondary mb-0">No admin replies yet.</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {replies.map((r) => (
                      <li key={r.id} className="mb-3 pb-3 border-bottom border-secondary-subtle">
                        <div className="f-s-12 text-muted mb-1">{fmtDateTime(r.createdAtMs)}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export function TicketViewPage() {
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')?.trim()

  if (id) {
    return <TicketThread ticketId={id} />
  }

  return <TicketViewRepliesList />
}
