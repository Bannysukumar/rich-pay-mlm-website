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

const SEO_DOC = 'default'

export function AdminSeoPage() {
  const [busy, setBusy] = useState(false)
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDesc, setMetaDesc] = useState('')
  const [keywords, setKeywords] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [robots, setRobots] = useState('index,follow')

  useEffect(() => {
    const ref = doc(db, COLLECTIONS.seoSettings, SEO_DOC)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return
      const d = snap.data() as Record<string, unknown>
      setMetaTitle(String(d.metaTitle ?? ''))
      setMetaDesc(String(d.metaDescription ?? ''))
      setKeywords(String(d.keywords ?? ''))
      setOgImage(String(d.ogImage ?? ''))
      setRobots(String(d.robots ?? 'index,follow'))
    })
  }, [])

  const persist = async () => {
    setBusy(true)
    try {
      await setDoc(
        doc(db, COLLECTIONS.seoSettings, SEO_DOC),
        {
          metaTitle: metaTitle.trim(),
          metaDescription: metaDesc.trim(),
          keywords: keywords.trim(),
          ogImage: ogImage.trim(),
          robots: robots.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      await pushAuditLog('adminSeoSave', {})
      toast.success('SEO mirror updated — wire landing meta tags separately')
    } catch {
      toast.error('Denied')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-zinc-100">SEO Settings</h1>
        <p className="text-sm text-zinc-500">
          Canonical «{SEO_DOC}» document for marketing ingestion pipelines.
        </p>
      </div>
      <Card className="grid gap-4 border-red-900/25 p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Meta title</Label>
          <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Meta description</Label>
          <textarea
            value={metaDesc}
            onChange={(e) => setMetaDesc(e.target.value)}
            className="mt-1 min-h-[80px] w-full rounded-xl border border-zinc-900 bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none focus:border-red-900"
          />
        </div>
        <div>
          <Label>Keywords</Label>
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <div>
          <Label>Robots</Label>
          <Input value={robots} onChange={(e) => setRobots(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Open Graph artwork</Label>
          <Input value={ogImage} onChange={(e) => setOgImage(e.target.value)} />
        </div>
      </Card>
      <Button type="button" variant="danger" disabled={busy} onClick={() => void persist()}>
        Commit SEO blueprint
      </Button>
    </motion.div>
  )
}
