import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listDirectReferrals } from '@/lib/api/directReferralsCallables'
import type { DirectReferralRow } from '@/types/models'

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(ts: number) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function DirectReferralsPage() {
  const [rows, setRows] = useState<DirectReferralRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { referrals } = await listDirectReferrals()
      setRows(referrals)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
      toast.error(msg || 'Could not load direct referrals')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="container-fluid py-4 px-3">
      <div className="row">
        <div className="col-12">
          <div className="card ki-profile-card border-secondary bg-dark text-light">
            <div className="card-header border-secondary bg-transparent py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <h4 className="card-title mb-0" style={{ color: 'var(--ki-gold)' }}>
                Direct Referrals
              </h4>
              <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => void load()} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive ki-direct-table-wrap">
                <table className="table table-hover table-borderless ki-data-table mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Serial</th>
                      <th scope="col">UserID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Joining Date</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Mobile</th>
                      <th scope="col">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="text-center text-secondary py-5">
                          Loading…
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-secondary py-5">
                          No direct referrals yet.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={`${r.username}-${i}`}>
                          <td>{i + 1}</td>
                          <td className="font-monospace">{r.username}</td>
                          <td>{r.fullName}</td>
                          <td>{fmtDate(r.createdAt)}</td>
                          <td>$ {fmtMoney(r.amount)}</td>
                          <td>{r.phone || '—'}</td>
                          <td>{fmtMoney(r.volume)}</td>
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
  )
}
