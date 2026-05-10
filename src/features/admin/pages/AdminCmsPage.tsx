import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { pushAuditLog } from '@/lib/admin/pushAuditLog'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

const PAGES = ['home', 'about', 'contact', 'faq', 'terms', 'privacy', 'testimonials', 'hero'] as const

export function AdminCmsPage() {
  const [slug, setSlug] = useState<(typeof PAGES)[number]>('home')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ref = doc(db, COLLECTIONS.cmsPages, slug)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setTitle(slug)
        setBody('')
        return
      }
      const d = snap.data() as Record<string, unknown>
      setTitle(String(d.title ?? slug))
      setBody(String(d.bodyHtml ?? d.body ?? ''))
    })
  }, [slug])

  const persist = async () => {
    setBusy(true)
    try {
      await setDoc(
        doc(db, COLLECTIONS.cmsPages, slug),
        {
          slug,
          title: title.trim(),
          bodyHtml: body,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      await pushAuditLog('adminCmsSave', { slug })
      toast.success('CMS slice cached at edge TTL 0 via Firestore stream')
    } catch {
      toast.error('Write blocked')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">CMS Management</h1>
        <p className="text-sm text-zinc-500">Bind marketing surfaces to keyed documents for instant propagation.</p>
      </div>
      <Card className="space-y-4 border-red-900/25 p-5">
        <div>
          <Label>Slug</Label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value as (typeof PAGES)[number])}
            className="mt-2 w-full rounded-xl border border-zinc-900 bg-[#09090b] px-3 py-2 text-xs text-zinc-100"
          >
            {PAGES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Display headline</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>HTML / prose</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-2 min-h-[260px] w-full rounded-xl border border-zinc-900 bg-transparent px-3 py-3 font-mono text-[11px] text-zinc-100 outline-none focus:border-red-900"
          />
        </div>
        <Button type="button" variant="danger" disabled={busy || !slug} onClick={() => void persist()}>
          Persist document
        </Button>
      </Card>
    </motion.div>
  )
}
