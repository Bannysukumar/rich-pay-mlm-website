import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'

export type WalletTxRow = {
  id: string
  createdAtMs: number
  description: string
  details: string
  credit: number
  debit: number
  balanceAfter: number
}

function mapDoc(doc: { id: string; data: () => Record<string, unknown> }): WalletTxRow {
  const d = doc.data()
  const ts = d.createdAt as { toMillis?: () => number } | undefined
  const createdAtMs =
    ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
  return {
    id: doc.id,
    createdAtMs,
    description: String(d.description ?? d.type ?? '—'),
    details: String(d.details ?? d.detail ?? d.note ?? ''),
    credit: Number(d.credit ?? d.cr ?? 0),
    debit: Number(d.debit ?? d.db ?? 0),
    balanceAfter: Number(d.balanceAfter ?? d.bal ?? d.balance ?? 0),
  }
}

/**
 * Live wallet ledger for the signed-in user. Uses Auth uid (not Redux) so the
 * Firestore query always matches security rules, and sorts client-side so the
 * composite index only needs userId + wallet (prefix of existing 3-field index).
 */
export function useWalletTransactionHistory(
  wallet: 'activation' | 'cash' | 'deposit',
  toastErrorPrefix: string,
) {
  const [rows, setRows] = useState<WalletTxRow[]>([])
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
        collection(db, COLLECTIONS.walletTransactions),
        where('userId', '==', user.uid),
        where('wallet', '==', wallet),
      )
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          const next: WalletTxRow[] = []
          snap.forEach((doc) => next.push(mapDoc(doc)))
          next.sort((a, b) => a.createdAtMs - b.createdAtMs)
          setRows(next)
          setLoading(false)
        },
        (err: Error & { code?: string }) => {
          setLoading(false)
          console.error(`[walletTransactions ${wallet}]`, err)
          const code = err?.code ?? ''
          if (code === 'failed-precondition') {
            toast.error(
              `${toastErrorPrefix} Firestore needs indexes — run: firebase deploy --only firestore:indexes`,
            )
          } else if (code === 'permission-denied') {
            toast.error(`${toastErrorPrefix} Check you are signed in, then refresh.`)
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
  }, [wallet, toastErrorPrefix])

  return { rows, loading }
}
