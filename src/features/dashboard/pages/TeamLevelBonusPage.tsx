import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { remainingTeamLevelWindowDays } from '@/lib/istCalendar'
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

function firestoreTsToMs(ts: unknown): number | null {
  if (ts == null) return null
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  const t = ts as { toMillis?: () => number; seconds?: number; _seconds?: number }
  if (typeof t.toMillis === 'function') return t.toMillis()
  const sec = t.seconds ?? t._seconds
  if (typeof sec === 'number' && Number.isFinite(sec)) return sec * 1000
  return null
}

function remainingTeamLevelWindowDaysLabel(
  startedAtMs: number | null,
  maxPayDays: number | null | undefined,
  storedRemaining: number | null | undefined,
  asOfMs: number,
): string {
  if (startedAtMs == null || maxPayDays === undefined) return '—'
  if (maxPayDays === null) return 'No day cap'
  if (typeof storedRemaining === 'number' && Number.isFinite(storedRemaining)) {
    return String(Math.max(0, Math.floor(storedRemaining)))
  }
  const remaining = remainingTeamLevelWindowDays(startedAtMs, maxPayDays, asOfMs)
  return remaining == null ? '—' : String(remaining)
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
  downlinePackageStartedAtMs: number | null
  teamLevelWindowMaxPayDays: number | null | undefined
  teamLevelWindowRemainingDays: number | null | undefined
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
          const startedMs = firestoreTsToMs(d.downlinePackageStartedAt)
          const maxDays = d.teamLevelWindowMaxPayDays as number | null | undefined
          const storedRemaining = d.teamLevelWindowRemainingDays as number | null | undefined
          next.push({
            id: doc.id,
            createdAtMs,
            description: describeEntry(d),
            amount: Number(d.amount ?? 0),
            downlinePackageStartedAtMs: startedMs,
            teamLevelWindowMaxPayDays: maxDays,
            teamLevelWindowRemainingDays: storedRemaining,
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
                <p className="text-muted small mb-2">
                  <strong>Remaining (days)</strong> is the payout-window days left for that downline stake{' '}
                  <em>as of that row&apos;s payout date</em> (IST calendar, same rules as daily ROI). Older rows
                  show higher remaining; each new daily payout should step down by 1. Legacy rows without stored
                  window data are estimated from the payout date.
                </p>
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Date </th>
                        <th>Description </th>
                        <th>Remaining (days) </th>
                        <th>Amount </th>
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
                            No team level bonus entries yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDate(r.createdAtMs)}</td>
                            <td>{r.description}</td>
                            <td>
                              {remainingTeamLevelWindowDaysLabel(
                                r.downlinePackageStartedAtMs,
                                r.teamLevelWindowMaxPayDays,
                                r.teamLevelWindowRemainingDays,
                                r.createdAtMs,
                              )}
                            </td>
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
