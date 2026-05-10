import { Link } from 'react-router-dom'
import { useUserTicketsList } from '@/hooks/useUserTicketsList'

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

const TICKETS_LOAD_ERROR = 'Could not load tickets.'

export function YourTicketsPage() {
  const { rows, loading } = useUserTicketsList(TICKETS_LOAD_ERROR)

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
