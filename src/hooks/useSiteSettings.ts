import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { SiteSettings } from '@/types/models'

const defaults: SiteSettings = {
  maintenanceMode: false,
  depositWalletAddress: '0x0000000000000000000000000000000000000000',
  depositNetwork: 'BEP20 (USDT)',
  minDeposit: 50,
  minWithdrawal: 25,
  withdrawFeePercent: 10,
  sponsorPercent: 5,
  teamLevelsCount: 30,
  tickerSymbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'],
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(defaults)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const ref = doc(db, COLLECTIONS.siteSettings, 'config')
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSettings(defaults)
          setLoaded(true)
          return
        }
        const d = snap.data() as Record<string, unknown>
        setSettings({
          ...defaults,
          maintenanceMode: Boolean(d.maintenanceMode),
          depositWalletAddress: String(d.depositWalletAddress ?? defaults.depositWalletAddress),
          depositNetwork: String(d.depositNetwork ?? defaults.depositNetwork),
          minDeposit: Number(d.minDeposit ?? defaults.minDeposit),
          minWithdrawal: Number(d.minWithdrawal ?? defaults.minWithdrawal),
          withdrawFeePercent: Number(d.withdrawFeePercent ?? defaults.withdrawFeePercent),
          sponsorPercent: Number(d.sponsorPercent ?? defaults.sponsorPercent),
          teamLevelsCount: Number(d.teamLevelsCount ?? defaults.teamLevelsCount),
          qrCodeUrl: d.qrCodeUrl != null ? String(d.qrCodeUrl) : undefined,
          tickerSymbols: Array.isArray(d.tickerSymbols)
            ? (d.tickerSymbols as string[])
            : defaults.tickerSymbols,
        })
        setLoaded(true)
      },
      () => {
        setSettings(defaults)
        setLoaded(true)
      },
    )
  }, [])

  return { settings, loaded }
}
