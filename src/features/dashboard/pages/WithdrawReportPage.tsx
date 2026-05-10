import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

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

function pickTxHash(d: Record<string, unknown>): string {
  const v = d.txHash ?? d.transactionHash ?? d.bscTxHash ?? d.tx
  return v != null ? String(v).trim() : ''
}

const BSCSCAN_TX = 'https://bscscan.com/tx/'

type Row = {
  id: string
  createdAtMs: number
  amount: number
  address: string
  txHash: string
}

export function WithdrawReportPage() {
  const { firebaseUid } = useAuthState()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseUid) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, COLLECTIONS.withdrawals),
      where('userId', '==', firebaseUid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Row[] = []
        snap.forEach((docSnap) => {
          const d = docSnap.data() as Record<string, unknown>
          const ts = d.createdAt
          const createdAtMs =
            ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function'
              ? (ts as { toMillis: () => number }).toMillis()
              : Number(d.createdAt ?? 0)
          next.push({
            id: docSnap.id,
            createdAtMs,
            amount: Number(d.amountGross ?? d.amount ?? 0),
            address: String(d.address ?? ''),
            txHash: pickTxHash(d),
          })
        })
        setRows(next)
        setLoading(false)
      },
      () => {
        setLoading(false)
        toast.error('Could not load withdrawals')
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
                <h4 className="card-title">Withdraw Report</h4>
              </div>
              <div className="card-body">
                <div className="app-datatable-default overflow-auto">
                  <table className="display app-data-table default-data-table" id="example">
                    <thead>
                      <tr>
                        <th>Serial </th>
                        <th>Date </th>
                        <th>Amount</th>
                        <th>Address</th>
                        <th>TxHash</th>
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
                            No withdrawals yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={r.id}>
                            <td className=" ">{i + 1}</td>
                            <td className=" ">{fmtWithdrawDate(r.createdAtMs)}</td>
                            <td className=" ">{fmtAmount(r.amount)}</td>
                            <td className=" ">{r.address || '—'}</td>
                            <td className=" ">
                              {r.txHash ? (
                                <a href={`${BSCSCAN_TX}${encodeURIComponent(r.txHash)}`} target="_blank" rel="noreferrer">
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
