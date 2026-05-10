import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'

export type WithdrawalRow = {
  id: string
  createdAtMs: number
  amount: number
  address: string
  txHash: string
}

function pickTxHash(d: Record<string, unknown>): string {
  const v = d.txHash ?? d.transactionHash ?? d.bscTxHash ?? d.tx
  return v != null ? String(v).trim() : ''
}

function mapWithdrawalDoc(docSnap: { id: string; data: () => Record<string, unknown> }): WithdrawalRow {
  const d = docSnap.data()
  const ts = d.createdAt as { toMillis?: () => number } | undefined
  const createdAtMs =
    ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
  return {
    id: docSnap.id,
    createdAtMs,
    amount: Number(d.amountGross ?? d.amount ?? 0),
    address: String(d.address ?? ''),
    txHash: pickTxHash(d),
  }
}

/** User withdrawal history — Auth uid, no Firestore orderBy; sort newest first in memory. */
export function useUserWithdrawalsList(toastErrorPrefix: string) {
  const [rows, setRows] = useState<WithdrawalRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubSnapshot: (() => void) | undefined

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSnapshot?.()
      unsubSnapshot = undefined

      if (!user) {
        setRows([])
        setLoading(false)
        return
      }

      setLoading(true)
      const q = query(
        collection(db, COLLECTIONS.withdrawals),
        where('userId', '==', user.uid),
      )
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          const next: WithdrawalRow[] = []
          snap.forEach((docSnap) => next.push(mapWithdrawalDoc(docSnap)))
          next.sort((a, b) => b.createdAtMs - a.createdAtMs)
          setRows(next)
          setLoading(false)
        },
        (err: Error & { code?: string }) => {
          setLoading(false)
          console.error('[withdrawals]', err)
          const code = err?.code ?? ''
          if (code === 'failed-precondition') {
            toast.error(
              `${toastErrorPrefix} Deploy Firestore indexes: firebase deploy --only firestore:indexes`,
            )
          } else if (code === 'permission-denied') {
            toast.error(`${toastErrorPrefix} Sign in again and refresh.`)
          } else {
            toast.error(toastErrorPrefix)
          }
          setRows([])
        },
      )
    })

    return () => {
      unsubAuth()
      unsubSnapshot?.()
    }
  }, [toastErrorPrefix])

  return { rows, loading }
}
