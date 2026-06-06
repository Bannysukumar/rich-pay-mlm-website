import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '@/app/store'
import { clearSession, setSession } from '@/app/authSlice'
import {
  clearAllLocalAuthSessionVersions,
  clearLocalAuthSessionVersion,
  getLocalAuthSessionVersion,
  setLocalAuthSessionVersion,
} from '@/lib/auth/authSessionVersion'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import type { RankCompensationSnapshot, UserProfile } from '@/types/models'

/**
 * Legacy bug: some user docs have a stray top-level segment `wallets.deposit` created by
 * `set(..., { merge: true })` writes. The real map is `wallets.{deposit,activation,cash}`.
 * Sum nested + stray so the UI matches server intent until `adminRepairWalletShadowFields` runs.
 */
function mergedWalletLeaf(
  raw: Record<string, unknown> | null | undefined,
  data: Record<string, unknown>,
  key: 'deposit' | 'activation' | 'cash',
): number {
  const nest = Number(raw?.[key] ?? 0)
  const shadowKey = `wallets.${key}`
  const shadowRaw = data[shadowKey]
  const shadow =
    typeof shadowRaw === 'number' && Number.isFinite(shadowRaw) ? shadowRaw : Number(shadowRaw ?? 0) || 0
  return nest + shadow
}

function mapUserDoc(uid: string, data: Record<string, unknown>): UserProfile {
  const raw = data.wallets as Record<string, unknown> | null | undefined
  const w: UserProfile['wallets'] = {
    deposit: mergedWalletLeaf(raw, data, 'deposit'),
    activation: mergedWalletLeaf(raw, data, 'activation'),
    cash: mergedWalletLeaf(raw, data, 'cash'),
  }
  return {
    uid,
    username: String(data.username ?? ''),
    email: String(data.email ?? ''),
    fullName: String(data.fullName ?? ''),
    phone: String(data.phone ?? ''),
    sponsorUsername: data.sponsorUsername != null ? String(data.sponsorUsername) : null,
    sponsorUid: data.sponsorUid != null ? String(data.sponsorUid) : null,
    role: (data.role as UserProfile['role']) || 'user',
    blocked: Boolean(data.blocked),
    wallets: w,
    totalWithdrawn: Number(data.totalWithdrawn ?? 0),
    activeDirects: Number(data.activeDirects ?? 0),
    currentRank: String(data.currentRank ?? '—'),
    totalTeamBusiness: Number(data.totalTeamBusiness ?? 0),
    powerTeamBusiness: Number(data.powerTeamBusiness ?? 0),
    restTeamBusiness: Number(data.restTeamBusiness ?? 0),
    nonWorkingIncomeBalance: Number(data.nonWorkingIncomeBalance ?? 0),
    workingIncomeBalance: Number(data.workingIncomeBalance ?? 0),
    totalWorkingIncome:
      data.userTotals != null && typeof data.userTotals === 'object'
        ? Number((data.userTotals as Record<string, unknown>).totalWorkingIncome ?? 0)
        : Number(data.sponsorBonusTotal ?? 0) +
          Number(data.teamLevelCommissionTotal ?? 0) +
          Number(data.rankCommissionTotal ?? 0),
    sponsorBonusTotal: Number(data.sponsorBonusTotal ?? 0),
    dailyProfitsTotal: Number(data.dailyProfitsTotal ?? 0),
    teamLevelCommissionTotal: Number(data.teamLevelCommissionTotal ?? 0),
    rankCommissionTotal: Number(data.rankCommissionTotal ?? 0),
    rankRewardActive: data.rankRewardActive === true,
    rankRewardDaysPaid: Number(data.rankRewardDaysPaid ?? 0),
    rankRewardTotalDays: Number(data.rankRewardTotalDays ?? 0),
    completedRankRewardIds: Array.isArray(data.completedRankRewardIds)
      ? (data.completedRankRewardIds as unknown[]).map(String)
      : undefined,
    rankCompensationSnapshot:
      data.rankCompensationSnapshot != null && typeof data.rankCompensationSnapshot === 'object'
        ? (data.rankCompensationSnapshot as RankCompensationSnapshot)
        : undefined,
    withdrawalPolicySnapshot:
      data.withdrawalPolicySnapshot != null && typeof data.withdrawalPolicySnapshot === 'object'
        ? (data.withdrawalPolicySnapshot as Record<string, unknown>)
        : undefined,
    city: data.city != null ? String(data.city) : undefined,
    usdtBep20Address: data.usdtBep20Address != null ? String(data.usdtBep20Address) : undefined,
    transactionPinSet: Boolean(data.transactionPinHash),
    dismissedReferralCampaignBanners:
      data.dismissedReferralCampaignBanners != null && typeof data.dismissedReferralCampaignBanners === 'object'
        ? Object.fromEntries(
            Object.entries(data.dismissedReferralCampaignBanners as Record<string, unknown>).map(([k, v]) => [
              k,
              Number(v),
            ]),
          )
        : undefined,
    authSessionVersion: Number(data.authSessionVersion ?? 0),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
  }
}

export function useAuthBootstrap() {
  const dispatch = useDispatch()

  useEffect(() => {
    let unsubProfile: (() => void) | undefined
    let unsubAuth: (() => void) | undefined
    let tokenRefreshTimer: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    /** Wait for IndexedDB / local persistence restore so we don’t flash logged-out on cold load. */
    void auth.authStateReady().then(() => {
      if (cancelled) return
      unsubAuth = onAuthStateChanged(auth, (user) => {
        unsubProfile?.()
        unsubProfile = undefined
        if (tokenRefreshTimer) {
          clearInterval(tokenRefreshTimer)
          tokenRefreshTimer = undefined
        }

        if (!user) {
          clearAllLocalAuthSessionVersions()
          dispatch(clearSession())
          return
        }

        void user.getIdToken(true).catch(() => {
          clearLocalAuthSessionVersion(user.uid)
          void signOut(auth)
        })

        tokenRefreshTimer = setInterval(
          () => {
            void user.getIdToken(true).catch(() => {
              clearLocalAuthSessionVersion(user.uid)
              void signOut(auth)
            })
          },
          5 * 60 * 1000,
        )

        const ref = doc(db, COLLECTIONS.users, user.uid)
        unsubProfile = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) {
              dispatch(
                setSession({
                  uid: user.uid,
                  profile: null,
                  loaded: true,
                }),
              )
              return
            }
            const data = snap.data() as Record<string, unknown>
            const serverVersion = Number(data.authSessionVersion ?? 0)
            const localVersion = getLocalAuthSessionVersion(user.uid)
            if (localVersion === null) {
              setLocalAuthSessionVersion(user.uid, serverVersion)
            } else if (serverVersion > localVersion) {
              clearLocalAuthSessionVersion(user.uid)
              dispatch(clearSession())
              void signOut(auth)
              return
            }

            dispatch(
              setSession({
                uid: user.uid,
                profile: mapUserDoc(user.uid, data),
                loaded: true,
              }),
            )
          },
          () => {
            dispatch(
              setSession({
                uid: user.uid,
                profile: null,
                loaded: true,
              }),
            )
          },
        )
      })
    })

    return () => {
      cancelled = true
      if (tokenRefreshTimer) clearInterval(tokenRefreshTimer)
      unsubAuth?.()
      unsubProfile?.()
    }
  }, [dispatch])
}

export function useAuthState() {
  return useSelector((s: RootState) => s.auth)
}
