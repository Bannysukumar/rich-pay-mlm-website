import { doc, increment, onSnapshot, setDoc } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

/** Real-time `siteSettings/config` + merge save for admin modules. */
export function useLiveSiteConfig() {
  const ref = doc(db, COLLECTIONS.siteSettings, 'config')
  const [data, setData] = useState<Record<string, unknown>>({})
  const [ready, setReady] = useState(false)

  useEffect(() =>
    onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? (snap.data() as Record<string, unknown>) : {})
        setReady(true)
      },
      () => setReady(true),
    ),
  [])

  const save = useCallback(
    async (
      patch: Record<string, unknown>,
      auditAction = 'adminSiteConfigPatch',
      opts?: { bumpPlanVersion?: boolean; bumpWithdrawPoliciesVersion?: boolean },
    ) => {
      const payload: Record<string, unknown> = { ...patch, updatedAt: Date.now() }
      if (opts?.bumpPlanVersion) payload.planSettingsVersion = increment(1)
      if (opts?.bumpWithdrawPoliciesVersion) payload.withdrawPoliciesVersion = increment(1)
      await setDoc(ref, payload, { merge: true })
      await pushAuditLog(auditAction, patch)
    },
    [ref],
  )

  return { data, ready, save }
}
