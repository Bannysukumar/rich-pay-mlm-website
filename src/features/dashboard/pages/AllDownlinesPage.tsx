import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listAllDownlines } from '@/lib/api/downlinesCallables'
import type { DownlineRow } from '@/types/models'

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

const COLS = ['Serial', 'UserID', 'Name', 'Joined On', 'Sponsor', 'Package', 'Level'] as const

export function AllDownlinesPage() {
  const [rows, setRows] = useState<DownlineRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { downlines } = await listAllDownlines()
      setRows(downlines)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
      toast.error(msg || 'Could not load downlines')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="container-fluid py-4 px-3 content-body">
      <div className="row">
        <div className="col-12">
          <div className="card ki-profile-card border-secondary bg-dark text-light">
            <div className="card-header border-secondary bg-transparent py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <h4 className="card-title mb-0" style={{ color: 'var(--ki-gold)' }}>
                Downlines
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
                      {COLS.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
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
                          No downlines in your network yet.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={`${r.username}-${i}`}>
                          <td>{i + 1}</td>
                          <td className="font-monospace">{r.username}</td>
                          <td>{r.fullName}</td>
                          <td>{fmtDate(r.createdAt)}</td>
                          <td className="font-monospace">{r.sponsorUsername}</td>
                          <td>$ {fmtMoney(r.packageAmount)}</td>
                          <td>
                            <span className="badge bg-secondary bg-opacity-25 text-warning border border-warning border-opacity-25">
                              Level{r.level}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      {COLS.map((c) => (
                        <th key={`f-${c}`} scope="col" className="small text-secondary">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
