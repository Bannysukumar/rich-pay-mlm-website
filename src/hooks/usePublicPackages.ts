import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

export type PublicPackageRow = {
  id: string
  name: string
  minAmount: number
  maxAmount: number
  roiPercent: number
  durationDays: number
  sortOrder: number
  /** Non-working / earning cap multiple (admin default often 2). */
  maxRoiMultiplier: number
}

function sortPackages(list: PublicPackageRow[]): PublicPackageRow[] {
  return [...list].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.minAmount - b.minAmount
  })
}

/** Active packages only — subscribe for marketing (/ , /plans) and signed-in storefront. */
export function usePublicPackages() {
  const [packages, setPackages] = useState<PublicPackageRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.packages), where('active', '==', true))
    return onSnapshot(
      q,
      (snap) => {
        const next: PublicPackageRow[] = []
        for (const docSnap of snap.docs) {
          const x = docSnap.data() as Record<string, unknown>
          const shelf = String(x.packageShelf ?? 'investment').toLowerCase()
          if (shelf === 'compounding') continue
          next.push({
            id: docSnap.id,
            name: String(x.name ?? 'Package').trim() || 'Package',
            minAmount: Number(x.minAmount ?? 0),
            maxAmount: Number(x.maxAmount ?? 0),
            roiPercent: Number(x.roiPercent ?? 0),
            durationDays: Number(x.durationDays ?? 0),
            sortOrder: Number(x.sortOrder ?? 0),
            maxRoiMultiplier: Number(x.maxRoiMultiplier ?? 2),
          })
        }
        setPackages(sortPackages(next))
        setLoaded(true)
      },
      () => {
        setPackages([])
        setLoaded(true)
      },
    )
  }, [])

  return { packages, loaded }
}

export function fmtUsdRange(min: number, max: number): string {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const nf = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: lo % 1 || hi % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })
  if (lo === hi) return `$${nf.format(lo)}`
  return `$${nf.format(lo)} – $${nf.format(hi)}`
}

/** Simple linear total % shown on cards (daily % × days), matching prior static demo. */
export function estimatedTotalRoiPercent(pkg: Pick<PublicPackageRow, 'roiPercent' | 'durationDays'>): number {
  return Math.round(pkg.roiPercent * pkg.durationDays * 100) / 100
}
