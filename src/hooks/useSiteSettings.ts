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
  depositNetwork: 'USDT BEP-20',
  depositInstructions: '',
  minDeposit: 50,
  minWithdrawal: 10,
  withdrawFeePercent: 10,
  withdrawalsEnabled: true,
  withdrawNetworkLabel: 'USDT BEP-20',
  withdrawalWindowTimezone: 'Etc/UTC',
  withdrawalWindowStart: '10:30',
  withdrawalWindowEnd: '13:30',
  withdrawalAllowedWeekdays: [1, 2, 3, 4, 5, 6],
  withdrawalRequiresActivePackage: true,
  withdrawalProcessingIntervalHours: 48,
  withdrawalProcessingMode: 'manual',
  withdrawalCooldownHours: 78,
  withdrawalAmountStep: 10,
  defaultWithdrawalPercentOfPackage: 20,
  withdrawPackageCaps: [],
  sponsorPercent: 5,
  teamLevelsCount: 30,
  nonWorkingIncomeCapMultiplier: 2,
  workingIncomeCapMultiplier: 3,
  stopAllIncomeWhenWorkingCapReached: false,
  rankRewardsEnabled: true,
  rankQualificationPowerPercent: 50,
  rankQualificationRestPercent: 50,
  roiEnabled: true,
  roiProcessHourUtc: 0,
  allowPeerActivationTransfer: true,
  /** When false, activation transfers are limited to direct referrals (server-enforced). */
  allowActivationTransferToAnyUser: false,
  allowIncomeToActivation: true,
  depositToActivationConvertEnabled: true,
  restrictPackageTopupToDirectReferrals: false,
  internalTransferFeePercent: 0,
  minActivationTransfer: 0,
  tickerSymbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'],
  referralWhatsappShareTemplate: undefined,
  referralWhatsappShareImageUrl: undefined,
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
          withdrawalsEnabled: d.withdrawalsEnabled !== undefined ? Boolean(d.withdrawalsEnabled) : defaults.withdrawalsEnabled,
          withdrawNetworkLabel:
            d.withdrawNetworkLabel != null ? String(d.withdrawNetworkLabel) : defaults.withdrawNetworkLabel,
          withdrawalWindowTimezone:
            d.withdrawalWindowTimezone != null
              ? String(d.withdrawalWindowTimezone)
              : defaults.withdrawalWindowTimezone,
          withdrawalWindowStart:
            d.withdrawalWindowStart != null ? String(d.withdrawalWindowStart) : defaults.withdrawalWindowStart,
          withdrawalWindowEnd:
            d.withdrawalWindowEnd != null ? String(d.withdrawalWindowEnd) : defaults.withdrawalWindowEnd,
          withdrawalAllowedWeekdays: Array.isArray(d.withdrawalAllowedWeekdays)
            ? (d.withdrawalAllowedWeekdays as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
            : defaults.withdrawalAllowedWeekdays,
          withdrawalRequiresActivePackage:
            d.withdrawalRequiresActivePackage !== undefined
              ? Boolean(d.withdrawalRequiresActivePackage)
              : defaults.withdrawalRequiresActivePackage,
          withdrawalProcessingIntervalHours: Number(
            d.withdrawalProcessingIntervalHours ?? defaults.withdrawalProcessingIntervalHours,
          ),
          withdrawalProcessingMode:
            d.withdrawalProcessingMode === 'auto'
              ? 'auto'
              : d.withdrawalProcessingMode === 'manual'
                ? 'manual'
                : defaults.withdrawalProcessingMode,
          withdrawalCooldownHours: Number(
            d.withdrawalCooldownHours ?? defaults.withdrawalCooldownHours ?? 78,
          ),
          withdrawalAmountStep: Number(d.withdrawalAmountStep ?? defaults.withdrawalAmountStep ?? 10),
          defaultWithdrawalPercentOfPackage: Number(
            d.defaultWithdrawalPercentOfPackage ?? defaults.defaultWithdrawalPercentOfPackage,
          ),
          withdrawPackageCaps: Array.isArray(d.withdrawPackageCaps)
            ? (d.withdrawPackageCaps as SiteSettings['withdrawPackageCaps']) ?? []
            : defaults.withdrawPackageCaps,
          withdrawPoliciesVersion:
            d.withdrawPoliciesVersion !== undefined ? Number(d.withdrawPoliciesVersion) : undefined,
          lastAutoWithdrawalRunAt:
            d.lastAutoWithdrawalRunAt !== undefined ? Number(d.lastAutoWithdrawalRunAt) : undefined,
          sponsorPercent: Number(d.sponsorPercent ?? defaults.sponsorPercent),
          teamLevelsCount: Number(d.teamLevelsCount ?? defaults.teamLevelsCount),
          planSettingsVersion:
            d.planSettingsVersion !== undefined ? Number(d.planSettingsVersion) : undefined,
          nonWorkingIncomeCapMultiplier: Number(
            d.nonWorkingIncomeCapMultiplier ?? defaults.nonWorkingIncomeCapMultiplier ?? 2,
          ),
          workingIncomeCapMultiplier: Number(
            d.workingIncomeCapMultiplier ?? defaults.workingIncomeCapMultiplier ?? 3,
          ),
          stopAllIncomeWhenWorkingCapReached:
            d.stopAllIncomeWhenWorkingCapReached !== undefined
              ? Boolean(d.stopAllIncomeWhenWorkingCapReached)
              : defaults.stopAllIncomeWhenWorkingCapReached,
          rankRewardsEnabled:
            d.rankRewardsEnabled !== undefined ? Boolean(d.rankRewardsEnabled) : defaults.rankRewardsEnabled,
          rankQualificationPowerPercent: Number(
            d.rankQualificationPowerPercent ?? defaults.rankQualificationPowerPercent ?? 50,
          ),
          rankQualificationRestPercent: Number(
            d.rankQualificationRestPercent ?? defaults.rankQualificationRestPercent ?? 50,
          ),
          roiEnabled: d.roiEnabled !== undefined ? Boolean(d.roiEnabled) : defaults.roiEnabled,
          roiProcessHourUtc: Number(d.roiProcessHourUtc ?? defaults.roiProcessHourUtc ?? 0),
          allowPeerActivationTransfer:
            d.allowPeerActivationTransfer !== undefined
              ? Boolean(d.allowPeerActivationTransfer)
              : defaults.allowPeerActivationTransfer,
          allowActivationTransferToAnyUser:
            d.allowActivationTransferToAnyUser !== undefined
              ? Boolean(d.allowActivationTransferToAnyUser)
              : defaults.allowActivationTransferToAnyUser,
          allowIncomeToActivation:
            d.allowIncomeToActivation !== undefined
              ? Boolean(d.allowIncomeToActivation)
              : defaults.allowIncomeToActivation,
          depositToActivationConvertEnabled:
            d.depositToActivationConvertEnabled !== undefined
              ? Boolean(d.depositToActivationConvertEnabled)
              : defaults.depositToActivationConvertEnabled,
          restrictPackageTopupToDirectReferrals:
            d.restrictPackageTopupToDirectReferrals === true,
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
          referralWhatsappShareTemplate:
            d.referralWhatsappShareTemplate != null
              ? String(d.referralWhatsappShareTemplate)
              : undefined,
          referralWhatsappShareImageUrl:
            d.referralWhatsappShareImageUrl != null
              ? String(d.referralWhatsappShareImageUrl)
              : undefined,
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
