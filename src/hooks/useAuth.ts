import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '@/app/store'
import { clearSession, setSession } from '@/app/authSlice'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/constants'
import type { UserProfile } from '@/types/models'

function mapUserDoc(uid: string, data: Record<string, unknown>): UserProfile {
  const w = (data.wallets as UserProfile['wallets']) || {
    deposit: 0,
    activation: 0,
    cash: 0,
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
    wallets: w,
    totalWithdrawn: Number(data.totalWithdrawn ?? 0),
    activeDirects: Number(data.activeDirects ?? 0),
    currentRank: String(data.currentRank ?? '—'),
    totalTeamBusiness: Number(data.totalTeamBusiness ?? 0),
    nonWorkingIncomeBalance: Number(data.nonWorkingIncomeBalance ?? 0),
    workingIncomeBalance: Number(data.workingIncomeBalance ?? 0),
    sponsorBonusTotal: Number(data.sponsorBonusTotal ?? 0),
    dailyProfitsTotal: Number(data.dailyProfitsTotal ?? 0),
    teamLevelCommissionTotal: Number(data.teamLevelCommissionTotal ?? 0),
    rankCommissionTotal: Number(data.rankCommissionTotal ?? 0),
    city: data.city != null ? String(data.city) : undefined,
    usdtBep20Address: data.usdtBep20Address != null ? String(data.usdtBep20Address) : undefined,
    transactionPinSet: Boolean(data.transactionPinHash),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
  }
}

export function useAuthBootstrap() {
  const dispatch = useDispatch()

  useEffect(() => {
    let unsubProfile: (() => void) | undefined

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.()
      unsubProfile = undefined

      if (!user) {
        dispatch(clearSession())
        return
      }

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
          dispatch(
            setSession({
              uid: user.uid,
              profile: mapUserDoc(user.uid, snap.data() as Record<string, unknown>),
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

    return () => {
      unsubAuth()
      unsubProfile?.()
    }
  }, [dispatch])
}

export function useAuthState() {
  return useSelector((s: RootState) => s.auth)
}
