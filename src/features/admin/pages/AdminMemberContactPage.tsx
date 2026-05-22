import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { adminUpdateMemberContactCallable } from '@/lib/api/adminCallables'
import { getCallableErrorMessage } from '@/lib/api/callableErrorMessage'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

type ResolvedMember = {
  uid: string
  username: string
  email: string
  phone: string
  fullName: string
}

function mapProfileContact(d: Record<string, unknown>) {
  return {
    fullName: String(d.fullName ?? '').trim(),
    username: String(d.username ?? '').trim(),
    email: String(d.email ?? '').trim(),
    phone: String(d.phone ?? '').trim(),
  }
}

export function AdminMemberContactPage() {
  const [lookup, setLookup] = useState('')
  const [resolved, setResolved] = useState<ResolvedMember | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)

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
        if (!uSnap.exists()) {
          toast.error('User profile missing')
          setResolved(null)
          return
        }
        const p = mapProfileContact(uSnap.data() as Record<string, unknown>)
        setResolved({
          uid,
          username: p.username || key,
          email: p.email,
          phone: p.phone,
          fullName: p.fullName,
        })
        setEmail(p.email)
        setPhone(p.phone)
        toast.success('Member loaded')
        return
      }
      const uSnap = await getDoc(doc(db, COLLECTIONS.users, raw))
      if (uSnap.exists()) {
        const p = mapProfileContact(uSnap.data() as Record<string, unknown>)
        setResolved({
          uid: raw,
          username: p.username || raw,
          email: p.email,
          phone: p.phone,
          fullName: p.fullName,
        })
        setEmail(p.email)
        setPhone(p.phone)
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
    if (!resolved) return
    const ref = doc(db, COLLECTIONS.users, resolved.uid)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return
      const p = mapProfileContact(snap.data() as Record<string, unknown>)
      setResolved((prev) =>
        prev && prev.uid === snap.id
          ? {
              ...prev,
              fullName: p.fullName,
              username: p.username || prev.username,
              email: p.email,
              phone: p.phone,
            }
          : prev,
      )
      setEmail(p.email)
      setPhone(p.phone)
    })
  }, [resolved?.uid])

  const saveContact = async (e: FormEvent) => {
    e.preventDefault()
    if (!resolved) return
    const nextEmail = email.trim().toLowerCase()
    const nextPhone = phone.trim().replace(/\s+/g, '')
    if (!nextEmail && !nextPhone) {
      toast.error('Enter email and/or mobile number')
      return
    }
    setSaving(true)
    try {
      const payload: { userId: string; email?: string; phone?: string } = { userId: resolved.uid }
      if (nextEmail && nextEmail !== resolved.email.trim().toLowerCase()) payload.email = nextEmail
      if (nextPhone && nextPhone !== resolved.phone.trim()) payload.phone = nextPhone
      if (payload.email === undefined && payload.phone === undefined) {
        toast.error('No changes to save')
        return
      }
      await adminUpdateMemberContactCallable(payload)
      await pushAuditLog('adminUpdateMemberContact', {
        userId: resolved.uid,
        email: payload.email,
        phone: payload.phone,
      })
      toast.success('Contact details updated')
    } catch (err: unknown) {
      toast.error(getCallableErrorMessage(err) || 'Update failed — deploy adminUpdateMemberContact function')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#e4e4e7] sm:text-2xl">Member email &amp; mobile</h1>
        <p className="text-sm text-[#9898a8]">
          Load a member by referral <span className="font-mono text-[#f5e6a8]">UserID</span> or Firebase{' '}
          <span className="font-mono text-[#f5e6a8]">UID</span>, then update login email and mobile. Updates Firestore,
          <code className="text-[#a8a8b8]"> phoneIndex</code>, <code className="text-[#a8a8b8]">usersByUsername</code>,
          and Firebase Auth email.
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
            {resolving ? 'Loading…' : 'Load member'}
          </Button>
        </div>

        {resolved ? (
          <div className="space-y-2 rounded-md border border-[rgba(212,175,55,0.15)] bg-[rgba(0,0,0,0.15)] px-3 py-3 text-[12px] text-[#c4c4ce]">
            <div>
              <span className="font-medium text-[#6b6b7c]">Name </span>
              <span className="text-[#e4e4e7]">{resolved.fullName || '—'}</span>
            </div>
            <div>
              <span className="font-medium text-[#6b6b7c]">UserID </span>
              <span className="font-mono font-semibold text-[#f5e6a8]">{resolved.username}</span>
            </div>
            <div>
              <span className="font-medium text-[#6b6b7c]">UID </span>
              <span className="font-mono text-[10px] text-[#9898a8]" title={resolved.uid}>
                {resolved.uid}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {resolved ? (
        <form className="admin-panel-sheet max-w-xl space-y-4 p-5" onSubmit={(ev) => void saveContact(ev)}>
          <div className="space-y-2">
            <Label>Email (login)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>Mobile number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              disabled={saving}
              inputMode="tel"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="danger" disabled={saving}>
            {saving ? 'Saving…' : 'Save email & mobile'}
          </Button>
          <p className="text-[10px] text-[#6b6b7c]">
            Requires deployed <code className="text-[#a8a8b8]">adminUpdateMemberContact</code>. Duplicate email or
            mobile is rejected.
          </p>
        </form>
      ) : null}
    </div>
  )
}
