import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { DepositStatus } from '@/types/models'

function paymentIdFromDocId(id: string): string {
  const alnum = id.replace(/[^a-zA-Z0-9]/g, '')
  return (alnum.slice(0, 13) || id.slice(0, 13)).toUpperCase()
}

function fmtDateTime(ms: number | undefined) {
  if (!ms) return 'N/A'
  return new Date(ms).toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function statusLabel(status: DepositStatus): string {
  if (status === 'pending') return 'Pending'
  if (status === 'approved') return 'Approved'
  return 'Deleted'
}

interface Row {
  id: string
  amount: number
  status: DepositStatus
  createdAtMs: number
  reviewedAtMs?: number
}

export function DepositHistoryPage() {
  const { firebaseUid } = useAuthState()
  const { settings } = useSiteSettings()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const address = settings.depositWalletAddress

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.deposits),
      where('userId', '==', firebaseUid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((doc) => {
          const d = doc.data()
          const created = d.createdAt
          const createdAtMs =
            created && typeof created.toMillis === 'function' ? created.toMillis() : 0
          const reviewed = d.reviewedAt
          const reviewedAtMs =
            reviewed && typeof reviewed.toMillis === 'function' ? reviewed.toMillis() : undefined
          next.push({
            id: doc.id,
            amount: Number(d.amount ?? 0),
            status: (d.status as DepositStatus) || 'pending',
            createdAtMs,
            reviewedAtMs,
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load deposit history')
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
                <h4 className="card-title mb-0">Deposit History</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table ki-data-table w-100" id="example">
                    <thead>
                      <tr>
                        <th>Serial</th>
                        <th>Date/Time</th>
                        <th>Payment ID</th>
                        <th>USDT</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Confirm On</th>
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
                            No deposit history yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td>{i + 1}</td>
                            <td>{fmtDateTime(r.createdAtMs)}</td>
                            <td className="font-monospace text-nowrap">{paymentIdFromDocId(r.id)}</td>
                            <td>{r.amount}</td>
                            <td className="text-break" style={{ maxWidth: '220px', fontSize: '0.85rem' }}>
                              {address}
                            </td>
                            <td>{statusLabel(r.status)}</td>
                            <td>{r.reviewedAtMs ? fmtDateTime(r.reviewedAtMs) : 'N/A'}</td>
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
