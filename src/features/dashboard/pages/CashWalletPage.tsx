import { useAuthState } from '@/hooks/useAuth'
import { useWalletTransactionHistory } from '@/hooks/useWalletTransactionHistory'

function fmtDate(ms: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
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

const CASH_HISTORY_ERROR = 'Could not load cash wallet history.'

export function CashWalletPage() {
  const { profile } = useAuthState()
  const { rows, loading } = useWalletTransactionHistory('cash', CASH_HISTORY_ERROR)

  const balance = profile?.wallets.cash ?? 0

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">Balance - $ {balance.toFixed(2)}</h4>
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
                            No cash wallet transactions yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.createdAtMs)}</td>
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
