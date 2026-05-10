import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

export type PublicRankRow = {
  id: string
  name: string
  requiredTeamBusiness: number
  dailyReward: number
  rewardDurationDays: number
  iconUrl?: string
}

/** Active rank tiers for public `/plans`. */
export function usePublicRanks() {
  const [rows, setRows] = useState<PublicRankRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.ranks), where('active', '==', true))
    return onSnapshot(
      q,
      (snap) => {
        const next: PublicRankRow[] = snap.docs.map((ds) => {
          const x = ds.data() as Record<string, unknown>
          return {
            id: ds.id,
            name: String(x.name ?? 'Rank').trim() || 'Rank',
            requiredTeamBusiness: Number(x.requiredTeamBusiness ?? x.teamBiz ?? 0),
            dailyReward: Number(x.dailyReward ?? 0),
            rewardDurationDays: Number(x.rewardDurationDays ?? x.durationDays ?? 0),
            iconUrl: x.iconUrl != null ? String(x.iconUrl).trim() || undefined : undefined,
          }
        })
        next.sort((a, b) => a.requiredTeamBusiness - b.requiredTeamBusiness)
        setRows(next)
        setLoaded(true)
      },
      () => {
        setRows([])
        setLoaded(true)
      },
    )
  }, [])

  return { ranks: rows, loaded }
}
