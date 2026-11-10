import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useAuthState } from '@/hooks/useAuth'
import { useDailyProfitsHistory } from '@/hooks/useDailyProfitsHistory'
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

function dayKey(ms: number) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('en-CA')
}

const DAILY_PROFITS_ERROR = 'Could not load daily profits.'

export function DailyProfitsPage() {
  const { firebaseUid, profile } = useAuthState()
  const { rows, loading } = useDailyProfitsHistory(DAILY_PROFITS_ERROR)
  const [pkgLabels, setPkgLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!firebaseUid) {
      setPkgLabels({})
      return
    }
    const q = query(collection(db, COLLECTIONS.activePackages), where('userId', '==', firebaseUid))
    return onSnapshot(
      q,
      (snap) => {
        const next: Record<string, string> = {}
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>
          const ps = d.planSnapshot as Record<string, unknown> | undefined
          const name = String(ps?.packageName ?? d.packageName ?? 'Package')
          const amount = Number(d.amount ?? 0)
          const started = d.startedAt as { toDate?: () => Date } | undefined
          const startLabel =
            started && typeof started.toDate === 'function'
              ? started.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : ''
          next[doc.id] = startLabel
            ? `${name} $${amount.toFixed(0)} · from ${startLabel}`
            : `${name} $${amount.toFixed(0)}`
        })
        setPkgLabels(next)
      },
      () => setPkgLabels({}),
    )
  }, [firebaseUid])

  const total = profile?.dailyProfitsTotal ?? 0

  const sameDayMultiPackage = useMemo(() => {
    const byDay = new Map<string, Set<string>>()
    for (const r of rows) {
      const k = dayKey(r.createdAtMs)
      if (!k || !r.activePackageId) continue
      const set = byDay.get(k) ?? new Set<string>()
      set.add(r.activePackageId)
      byDay.set(k, set)
    }
    return [...byDay.values()].some((s) => s.size > 1)
  }, [rows])

  const activePackageCount = useMemo(() => new Set(Object.keys(pkgLabels)).size, [pkgLabels])
  const showMultiNote = sameDayMultiPackage || activePackageCount > 1

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">Total Daily Profits - $ {total.toFixed(4)}</h4>
              </div>
              <div className="card-body">
                <p className="text-muted small mb-2">
                  This is your <strong>daily profit</strong> from each active package. Every package pays separately.
                </p>
                {showMultiNote ? (
                  <div className="alert alert-secondary border small mb-3" role="status">
                    You have more than one package. Seeing <strong>two lines on the same date</strong> is normal —
                    one payment from each package, not a double credit.
                  </div>
                ) : (
                  <p className="text-muted small mb-3">
                    If you later activate a second package, you may see two lines on the same date. That is normal.
                  </p>
                )}
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>What you received</th>
                        <th>From package</th>
                        <th>Amount</th>
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
                            No daily profits yet. Activate a package to start earning.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.createdAtMs)}</td>
                            <td>Daily profit</td>
                            <td className="small">
                              {r.activePackageId
                                ? (pkgLabels[r.activePackageId] ?? `Package ${r.activePackageId.slice(0, 6)}…`)
                                : '—'}
                            </td>
                            <td>$ {r.amount.toFixed(4)}</td>
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
