import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

export type PublicTeamLevelRow = {
  id: string
  level: number
  percent: number
  requiredDirects: number
  conditionDescription?: string
  sortOrder: number
}

function sortRows(list: PublicTeamLevelRow[]): PublicTeamLevelRow[] {
  return [...list].sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.level - b.level))
}

/** Active team-level rows for public `/plans` (must match admin matrix). */
export function usePublicTeamLevels() {
  const [rows, setRows] = useState<PublicTeamLevelRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.teamLevels), where('active', '==', true))
    return onSnapshot(
      q,
      (snap) => {
        const next: PublicTeamLevelRow[] = snap.docs.map((ds) => {
          const x = ds.data() as Record<string, unknown>
          return {
            id: ds.id,
            level: Number(x.level ?? 0),
            percent: Number(x.percent ?? 0),
            requiredDirects: Number(x.requiredDirects ?? x.directs ?? 0),
            conditionDescription:
              x.conditionDescription != null ? String(x.conditionDescription).trim() : undefined,
            sortOrder: Number(x.sortOrder ?? x.level ?? 0),
          }
        })
        setRows(sortRows(next))
        setLoaded(true)
      },
      () => {
        setRows([])
        setLoaded(true)
      },
    )
  }, [])

  return { teamLevels: rows, loaded }
}
