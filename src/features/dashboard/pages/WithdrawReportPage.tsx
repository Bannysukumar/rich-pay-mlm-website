import { useUserWithdrawalsList } from '@/hooks/useUserWithdrawalsList'
import type { WithdrawStatus } from '@/types/models'

function fmtWithdrawDate(ms: number) {
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

function fmtAmount(n: number) {
  return n.toFixed(2)
}

const BSCSCAN_TX = 'https://bscscan.com/tx/'

const WITHDRAWALS_LOAD_ERROR = 'Could not load withdrawals.'

function statusLabel(s: WithdrawStatus): string {
  switch (s) {
    case 'pending':
      return 'Pending'
    case 'processing':
      return 'Processing'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'paid':
      return 'Paid'
    default:
      return String(s)
  }
}

function statusClass(s: WithdrawStatus): string {
  switch (s) {
    case 'pending':
      return 'text-warning'
    case 'processing':
      return 'text-info'
    case 'approved':
      return 'text-primary'
    case 'rejected':
      return 'text-danger'
    case 'paid':
      return 'text-success'
    default:
      return 'text-secondary'
  }
}

export function WithdrawReportPage() {
  const { rows, loading } = useUserWithdrawalsList(WITHDRAWALS_LOAD_ERROR)

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Withdraw Report</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Date </th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Address</th>
                        <th>TxHash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-secondary">
                            No withdrawals yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td className=" ">{i + 1}</td>
                            <td className=" ">{fmtWithdrawDate(r.createdAtMs)}</td>
                            <td className={`fw-semibold ${statusClass(r.status)}`}>{statusLabel(r.status)}</td>
                            <td className=" ">{fmtAmount(r.amount)}</td>
                            <td className=" ">{r.address || '—'}</td>
                            <td className=" ">
                              {r.txHash ? (
                                <a
                                  href={`${BSCSCAN_TX}${encodeURIComponent(r.txHash)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.txHash}
                                </a>
                              ) : (
                                '—'
                              )}
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
