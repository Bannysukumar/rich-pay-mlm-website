import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { endsAtMillisFromDoc, isLiveActivePackage } from '@/lib/activePackagesDisplay'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

/** Day → Month → Year, e.g. 03 Aug 2026 (avoids MM/DD vs DD/MM confusion). */
function fmtDate(ms: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysRemaining(endsAtMs: number, liveActive: boolean): number {
  if (!liveActive) return 0
  if (!endsAtMs) return 0
  const d = Math.ceil((endsAtMs - Date.now()) / 86400000)
  return Math.max(0, d)
}

function planLabel(planType: unknown): string {
  const p = String(planType ?? 'daily').toLowerCase()
  if (p === 'compounding') return 'Compounding Plan'
  return 'Daily Plan'
}

function statusReasonLabel(reason: string | null, liveActive: boolean): string {
  if (liveActive) return 'Active'
  if (!reason) return 'Inactive'
  if (reason === 'daily_roi_2x') return 'Inactive · 2× ROI'
  if (reason === 'package_income_3x' || reason === 'total_income_3x') return 'Inactive · 3× limit'
  if (reason === 'plan_ended') return 'Inactive · plan end'
  return `Inactive · ${reason}`
}

type Row = {
  id: string
  startedAtMs: number
  endsAtMs: number
  amount: number
  status: string
  liveActive: boolean
  planType: unknown
  completedReason: string | null
  roiPaid: number
  roiMax: number
  roiLeft: number
  packageName: string
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
          const d = doc.data() as Record<string, unknown>
          const started = d.startedAt as { toMillis?: () => number } | undefined
          const startedAtMs =
            started && typeof started.toMillis === 'function' ? started.toMillis() : 0
          const endsAtMs = endsAtMillisFromDoc(d)
          const ps = d.planSnapshot as Record<string, unknown> | undefined
          const amt = Number(d.amount ?? 0)
          const nw = Number(
            d.frozenNonWorkingCapMultiplier ??
              (ps != null && ps.nonWorkingIncomeCapMultiplier != null
                ? Number(ps.nonWorkingIncomeCapMultiplier)
                : 2),
          )
          const roiPaid = Math.max(0, Number(d.nonWorkingPaid ?? 0))
          const roiMax = amt * Math.max(0, nw)
          const liveActive = isLiveActivePackage(d)
          next.push({
            id: doc.id,
            startedAtMs,
            endsAtMs,
            amount: amt,
            status: String(d.status ?? 'active'),
            liveActive,
            planType: d.planType ?? ps?.planType,
            completedReason: d.completedReason != null ? String(d.completedReason) : null,
            roiPaid,
            roiMax,
            roiLeft: liveActive ? Math.max(0, roiMax - roiPaid) : 0,
            packageName: String(ps?.packageName ?? d.packageName ?? 'Package'),
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
                <p className="small text-secondary mb-0 mt-1">
                  Active and inactive packages with today’s ROI calculation.
                </p>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Package</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Daily ROI (today)</th>
                        <th>Days Left</th>
                        <th>Plan Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-secondary">
                            No topup records yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.startedAtMs)}</td>
                            <td>{r.packageName}</td>
                            <td>$ {fmtMoney(r.amount)}</td>
                            <td>
                              <span className={r.liveActive ? 'text-success' : 'text-danger'}>
                                {statusReasonLabel(r.completedReason, r.liveActive)}
                              </span>
                            </td>
                            <td>
                              $ {fmtMoney(r.roiPaid)} / $ {fmtMoney(r.roiMax)} (2×)
                              {r.liveActive ? (
                                <span className="d-block small text-success">
                                  $ {fmtMoney(r.roiLeft)} left
                                </span>
                              ) : (
                                <span className="d-block small text-secondary">No more ROI</span>
                              )}
                            </td>
                            <td>{daysRemaining(r.endsAtMs, r.liveActive)}</td>
                            <td>{planLabel(r.planType)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Package</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Daily ROI</th>
                        <th>Days Left</th>
                        <th>Plan</th>
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
