import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'

export type TicketListRow = {
  id: string
  createdAtMs: number
  priority: string
  department: string
  subject: string
  status: string
}

/** Your tickets — auth uid only, sort client-side (newest first) to skip composite indexes. */
export function useUserTicketsList(toastErrorPrefix: string) {
  const [rows, setRows] = useState<TicketListRow[]>([])
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
        collection(db, COLLECTIONS.tickets),
        where('userId', '==', user.uid),
      )
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          const next: TicketListRow[] = []
          snap.forEach((docSnap) => {
            const d = docSnap.data()
            const ts = d.createdAt as { toMillis?: () => number } | undefined
            const createdAtMs =
              ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Number(d.createdAt ?? 0)
            next.push({
              id: docSnap.id,
              createdAtMs,
              priority: String(d.priority ?? ''),
              department: String(d.department ?? ''),
              subject: String(d.title ?? ''),
              status: String(d.status ?? ''),
            })
          })
          next.sort((a, b) => b.createdAtMs - a.createdAtMs)
          setRows(next)
          setLoading(false)
        },
        (err: Error & { code?: string }) => {
          setLoading(false)
          console.error('[tickets list]', err)
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
