import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'
import type { SiteSettings } from '@/types/models'

const defaults: SiteSettings = {
  maintenanceMode: false,
  siteName: 'Rich Pay',
  currencyLabel: 'USDT',
  timezone: 'UTC',
  depositWalletAddress: '0x0000000000000000000000000000000000000000',
  depositNetwork: 'BEP20 (USDT)',
  depositInstructions: '',
  minDeposit: 50,
  minWithdrawal: 25,
  withdrawFeePercent: 10,
  sponsorPercent: 5,
  teamLevelsCount: 30,
  roiEnabled: true,
  roiProcessHourUtc: 0,
  allowPeerActivationTransfer: true,
  allowIncomeToActivation: true,
  internalTransferFeePercent: 0,
  minActivationTransfer: 0,
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
          siteName: d.siteName != null ? String(d.siteName) : defaults.siteName,
          currencyLabel: d.currencyLabel != null ? String(d.currencyLabel) : defaults.currencyLabel,
          timezone: d.timezone != null ? String(d.timezone) : defaults.timezone,
          supportEmail: d.supportEmail != null ? String(d.supportEmail) : undefined,
          supportWhatsapp: d.supportWhatsapp != null ? String(d.supportWhatsapp) : undefined,
          logoUrl: d.logoUrl != null ? String(d.logoUrl) : undefined,
          faviconUrl: d.faviconUrl != null ? String(d.faviconUrl) : undefined,
          socialTelegram: d.socialTelegram != null ? String(d.socialTelegram) : undefined,
          socialTwitter: d.socialTwitter != null ? String(d.socialTwitter) : undefined,
          depositWalletAddress: String(d.depositWalletAddress ?? defaults.depositWalletAddress),
          depositNetwork: String(d.depositNetwork ?? defaults.depositNetwork),
          depositInstructions:
            d.depositInstructions != null ? String(d.depositInstructions) : defaults.depositInstructions,
          minDeposit: Number(d.minDeposit ?? defaults.minDeposit),
          minWithdrawal: Number(d.minWithdrawal ?? defaults.minWithdrawal),
          withdrawFeePercent: Number(d.withdrawFeePercent ?? defaults.withdrawFeePercent),
          sponsorPercent: Number(d.sponsorPercent ?? defaults.sponsorPercent),
          teamLevelsCount: Number(d.teamLevelsCount ?? defaults.teamLevelsCount),
          roiEnabled: d.roiEnabled !== undefined ? Boolean(d.roiEnabled) : defaults.roiEnabled,
          roiProcessHourUtc: Number(d.roiProcessHourUtc ?? defaults.roiProcessHourUtc ?? 0),
          allowPeerActivationTransfer:
            d.allowPeerActivationTransfer !== undefined
              ? Boolean(d.allowPeerActivationTransfer)
              : defaults.allowPeerActivationTransfer,
          allowIncomeToActivation:
            d.allowIncomeToActivation !== undefined
              ? Boolean(d.allowIncomeToActivation)
              : defaults.allowIncomeToActivation,
          internalTransferFeePercent: Number(
            d.internalTransferFeePercent ?? defaults.internalTransferFeePercent ?? 0,
          ),
          minActivationTransfer: Number(
            d.minActivationTransfer ?? defaults.minActivationTransfer ?? 0,
          ),
          qrCodeUrl: d.qrCodeUrl != null ? String(d.qrCodeUrl) : undefined,
          tickerSymbols: Array.isArray(d.tickerSymbols)
            ? (d.tickerSymbols as string[])
            : defaults.tickerSymbols,
          publicPlansSponsorBody: d.publicPlansSponsorBody != null ? String(d.publicPlansSponsorBody) : undefined,
          publicPlansSponsorPill: d.publicPlansSponsorPill != null ? String(d.publicPlansSponsorPill) : undefined,
          publicPlansTeamLead: d.publicPlansTeamLead != null ? String(d.publicPlansTeamLead) : undefined,
          publicPlansRankFootnote: d.publicPlansRankFootnote != null ? String(d.publicPlansRankFootnote) : undefined,
          publicPlansGuidelineExtra: d.publicPlansGuidelineExtra != null ? String(d.publicPlansGuidelineExtra) : undefined,
          publicContactResponseTime:
            d.publicContactResponseTime != null ? String(d.publicContactResponseTime) : undefined,
          publicContactHeroSub:
            d.publicContactHeroSub != null ? String(d.publicContactHeroSub) : undefined,
          publicContactFooterNote:
            d.publicContactFooterNote != null ? String(d.publicContactFooterNote) : undefined,
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
