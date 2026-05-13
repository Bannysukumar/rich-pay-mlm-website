import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type MemberPackageRow = {
  id: string
  status: string
  amount: number
  planType: string
  packageName: string
  adminRoiPaused: boolean
}

function mapMemberPackage(docSnap: { id: string; data: () => Record<string, unknown> }): MemberPackageRow {
  const d = docSnap.data()
  const ps = d.planSnapshot as Record<string, unknown> | undefined
  return {
    id: docSnap.id,
    status: String(d.status ?? ''),
    amount: Number(d.amount ?? 0),
    planType: String(d.planType ?? ps?.planType ?? '—'),
    packageName: String(ps?.packageName ?? d.packageId ?? '—'),
    adminRoiPaused: d.adminRoiPaused === true,
  }
}

type ResolvedMember = { uid: string; username: string; email: string }

export function AdminMemberInvestmentPlansPage() {
  const [lookup, setLookup] = useState('')
  const [resolved, setResolved] = useState<ResolvedMember | null>(null)
  const [memberPackages, setMemberPackages] = useState<MemberPackageRow[]>([])
  const [resolving, setResolving] = useState(false)

  const resolveMember = useCallback(async () => {
    const raw = lookup.trim()
    if (!raw) {
      toast.error('Enter a member UserID or Auth UID')
      return
    }
    setResolving(true)
    try {
      const key = raw.toLowerCase()
      const mapSnap = await getDoc(doc(db, COLLECTIONS.usersByUsername, key))
      if (mapSnap.exists()) {
        const uid = String(mapSnap.data()?.uid ?? '').trim()
        if (!uid) {
          toast.error('Username map has no uid')
          setResolved(null)
          return
        }
        const uSnap = await getDoc(doc(db, COLLECTIONS.users, uid))
        const username = uSnap.exists() ? String(uSnap.data()?.username ?? key) : key
        const email = uSnap.exists() ? String(uSnap.data()?.email ?? '') : ''
        setResolved({ uid, username, email })
        toast.success('Member loaded')
        return
      }
      const uSnap = await getDoc(doc(db, COLLECTIONS.users, raw))
      if (uSnap.exists()) {
        const username = String(uSnap.data()?.username ?? raw)
        const email = String(uSnap.data()?.email ?? '')
        setResolved({ uid: raw, username, email })
        toast.success('Member loaded')
        return
      }
      toast.error('No member found for that UserID or UID')
      setResolved(null)
    } catch {
      toast.error('Lookup failed')
      setResolved(null)
    } finally {
      setResolving(false)
    }
  }, [lookup])

  useEffect(() => {
    if (!resolved) {
      setMemberPackages([])
      return
    }
    const qRef = query(
      collection(db, COLLECTIONS.activePackages),
      where('userId', '==', resolved.uid),
      orderBy('startedAt', 'desc'),
    )
    return onSnapshot(
      qRef,
      (snap) => {
        const list: MemberPackageRow[] = []
        snap.forEach((ds) => list.push(mapMemberPackage(ds)))
        setMemberPackages(list)
      },
      () => {
        toast.error('Could not load member packages')
      },
    )
  }, [resolved?.uid])

  const setPackageRoiPaused = async (packageId: string, paused: boolean, userId: string) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.activePackages, packageId), {
        adminRoiPaused: paused,
        updatedAt: Date.now(),
      })
      await pushAuditLog('adminActivePackageRoiPause', {
        activePackageId: packageId,
        userId,
        adminRoiPaused: paused,
      })
      toast.success(paused ? 'Daily ROI paused for this plan' : 'Daily ROI resumed for this plan')
    } catch {
      toast.error('Could not update plan — check permissions')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Member investment plans (ROI)</h1>
        <p className="text-sm text-[#9898a8]">
          Load a member by referral <span className="font-mono text-[#f5e6a8]">UserID</span> or Firebase{' '}
          <span className="font-mono text-[#f5e6a8]">UID</span>, then pause daily ROI per active package.
        </p>
      </div>

      <div className="admin-panel-sheet max-w-xl space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label>Member UserID or Auth UID</Label>
            <Input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="e.g. 4545719 or Auth uid…"
              disabled={resolving}
            />
          </div>
          <Button type="button" variant="danger" disabled={resolving} onClick={() => void resolveMember()}>
            {resolving ? 'Loading…' : 'Load packages'}
          </Button>
        </div>

        {resolved ? (
          <div className="rounded-md border border-[rgba(212,175,55,0.15)] bg-[rgba(0,0,0,0.15)] px-3 py-2 text-[12px] text-[#c4c4ce]">
            <span className="font-mono font-semibold text-[#f5e6a8]">{resolved.username}</span>
            <span className="mx-2 text-[#6b6b7c]">·</span>
            <span className="font-mono text-[10px] text-[#9898a8]" title={resolved.uid}>
              UID {resolved.uid.length > 18 ? `${resolved.uid.slice(0, 18)}…` : resolved.uid}
            </span>
            {resolved.email ? (
              <>
                <span className="mx-2 text-[#6b6b7c]">·</span>
                <span className="break-all text-[11px]">{resolved.email}</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {resolved ? (
        <div className="admin-panel-sheet max-w-2xl space-y-4 p-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
            Investment plans (ROI)
          </p>
          <p className="mb-3 text-[10px] leading-snug text-[#6b6b7c]">
            For <span className="font-semibold text-[#9898a8]">active</span> plans only: pause stops daily ROI and
            team-level share from that package until you turn it back on. Deploy latest{' '}
            <code className="text-[#a8a8b8]">processDailyRoi</code> for production.
          </p>
          {memberPackages.length === 0 ? (
            <p className="text-xs text-[#9898a8]">No packages for this member.</p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {memberPackages.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-[rgba(212,175,55,0.12)] bg-[rgba(0,0,0,0.2)] px-2.5 py-2 text-[11px]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-medium text-[#e4e4e7]">{p.packageName}</span>
                    <span
                      className={
                        p.status === 'active'
                          ? 'text-[#86efac]'
                          : p.status === 'capped'
                            ? 'text-[#fcd34d]'
                            : 'text-[#9898a8]'
                      }
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#9898a8]">
                    ${p.amount.toFixed(2)} · {p.planType} ·{' '}
                    <span className="font-mono text-[9px] text-[#6b6b7c]" title={p.id}>
                      {p.id.length > 10 ? `${p.id.slice(0, 10)}…` : p.id}
                    </span>
                  </div>
                  {p.status === 'active' ? (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-[10px] text-[#c4c4ce]">
                      <input
                        type="checkbox"
                        className="accent-red-600"
                        checked={p.adminRoiPaused}
                        onChange={(e) => void setPackageRoiPaused(p.id, e.target.checked, resolved.uid)}
                      />
                      Pause daily ROI for this plan
                    </label>
                  ) : (
                    <p className="mt-1.5 text-[10px] text-[#6b6b7c]">ROI accrual not running (not active).</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
