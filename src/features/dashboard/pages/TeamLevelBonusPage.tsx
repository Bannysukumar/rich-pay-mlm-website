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

type WindowLabel = { primary: string; secondary?: string }

/** Plain-language progress of the downline sharing period on that payout date. */
function remainingTeamLevelWindowDaysLabel(
  startedAtMs: number | null,
  maxPayDays: number | null | undefined,
  storedRemaining: number | null | undefined,
  asOfMs: number,
): WindowLabel {
  if (startedAtMs == null || maxPayDays === undefined) return { primary: '—' }
  if (maxPayDays === null) return { primary: 'Open', secondary: 'No day limit for this package' }
  const rem =
    typeof storedRemaining === 'number' && Number.isFinite(storedRemaining)
      ? Math.max(0, Math.floor(storedRemaining))
      : remainingTeamLevelWindowDays(startedAtMs, maxPayDays, asOfMs)
  if (rem == null) return { primary: '—' }
  const max = Math.max(0, Math.floor(Number(maxPayDays) || 0))
  if (max <= 0) return { primary: String(rem) }

  const dayNumber = Math.min(max, Math.max(1, max - rem + 1))
  if (rem <= 0) {
    return { primary: 'Finished', secondary: `All ${max} sharing days used` }
  }
  const leftWord = rem === 1 ? '1 day left' : `${rem} days left`
  return {
    primary: `Day ${dayNumber} of ${max}`,
    secondary: leftWord,
  }
}

function describeEntry(d: Record<string, unknown>) {
  const desc = d.description
  if (typeof desc === 'string' && desc.trim()) {
    const t = desc.trim()
    if (/level\s*\d+/i.test(t)) return t.replace(/bonus/i, 'bonus').replace(/^Level/i, 'Level')
    return t
  }
  const level = d.level ?? d.teamLevel ?? d.lvl
  const n = typeof level === 'number' ? level : Number(level)
  if (Number.isFinite(n) && n > 0) return `Level ${n} bonus`
  return 'Team level bonus'
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
                  This is your <strong>daily team share</strong> from members under you. You earn it while their
                  package is still sharing with the team.
                </p>
                <div className="alert alert-secondary border small mb-3" role="status">
                  <strong>Progress</strong> means which sharing day it was (example: Day 2 of 50). Different packages
                  share for different lengths — often about half of the plan days (100-day plan ≈ 50 sharing days,
                  200-day plan ≈ 100). Saturday and Sunday are holidays: no credit that day, and those days do not
                  count toward the sharing total. Seeing 50 on one row and 100 on another is normal.
                </div>
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>What you received</th>
                        <th>Progress</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={4} className="text-secondary">
                            Loading…
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-secondary">
                            No team level bonus yet. When your team earns daily profit, your share can appear here.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => {
                          const status = remainingTeamLevelWindowDaysLabel(
                            r.downlinePackageStartedAtMs,
                            r.teamLevelWindowMaxPayDays,
                            r.teamLevelWindowRemainingDays,
                            r.createdAtMs,
                          )
                          return (
                            <tr key={r.id}>
                              <td>{fmtDate(r.createdAtMs)}</td>
                              <td>{r.description}</td>
                              <td>
                                <div className="fw-medium">{status.primary}</div>
                                {status.secondary ? (
                                  <div className="small text-secondary">{status.secondary}</div>
                                ) : null}
                              </td>
                              <td>$ {r.amount.toFixed(4)}</td>
                            </tr>
                          )
                        })
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
