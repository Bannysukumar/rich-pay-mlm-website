import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'

export type DailyProfitRow = {
  id: string
  createdAtMs: number
  description: string
  amount: number
}

/**
 * User’s daily profit rows. Auth uid + optional client sort only (no orderBy) so a
 * single-field userId filter works without a composite index.
 */
export function useDailyProfitsHistory(toastErrorPrefix: string) {
  const [rows, setRows] = useState<DailyProfitRow[]>([])
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
        collection(db, COLLECTIONS.dailyProfits),
        where('userId', '==', user.uid),
      )
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          const next: DailyProfitRow[] = []
          snap.forEach((doc) => {
            const d = doc.data()
            const ts = d.createdAt as { toMillis?: () => number } | undefined
            const createdAtMs =
              ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
            next.push({
              id: doc.id,
              createdAtMs,
              description: String(d.description ?? 'Daily Income'),
              amount: Number(d.amount ?? 0),
            })
          })
          next.sort((a, b) => a.createdAtMs - b.createdAtMs)
          setRows(next)
          setLoading(false)
        },
        (err: Error & { code?: string }) => {
          setLoading(false)
          console.error('[dailyProfits]', err)
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
  }, [toastErrorPrefix])

  return { rows, loading }
}
